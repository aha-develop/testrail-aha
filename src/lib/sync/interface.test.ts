import { TIMEOUT_MESSAGE } from '../api';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';
import {
  waitForLambda,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';

jest.mock('../extensionFields/queries', () => ({
  getAccountExtensionFieldMap: jest.fn(),
}));

const runners = [
  {
    name: 'single request',
    run: lambdaFunc => waitForLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'paged requests',
    run: lambdaFunc => waitForPagedLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'indexed requests',
    run: lambdaFunc => waitForIndexedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, numIds: 1,
      argFunc: index => ({ parentId: index }),
    }),
  },
];

const batchRunners = [
  {
    name: 'pages',
    firstBatchSize: 1,
    total: 6,
    run: lambdaFunc => waitForPagedLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'unpaged parents',
    firstBatchSize: 50,
    total: 55,
    run: lambdaFunc => waitForPagedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, usePage: false,
      idKey: 'parentId', ids: Array.from({ length: 55 }, (_, index) => index),
    }),
  },
  {
    name: 'indexed parents',
    firstBatchSize: 50,
    total: 55,
    run: lambdaFunc => waitForIndexedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, numIds: 55,
      argFunc: index => ({ parentId: index }),
    }),
  },
];

describe('sync API cooldown', () => {
  let fields: { [key: string]: any };
  const cooldownReads = () => (getAccountExtensionFieldMap as jest.Mock).mock.calls
    .filter(([keys]) => keys.includes('retryAt')).length;
  const success = {
    message: 'Synced',
    result: { result: ['record'], hasMore: false },
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: 1000000 });
    fields = {};
    (global as any).aha = {
      account: {
        clearExtensionField: jest.fn(async (_identifier, key) => {
          delete fields[key];
        }),
      },
    };
    (getAccountExtensionFieldMap as jest.Mock).mockImplementation(async keys =>
      Object.fromEntries(keys.filter(key => fields[key] !== undefined)
        .map(key => [key, fields[key]]))
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe.each(runners)('$name', ({ run }) => {
    it('does not dispatch until an existing cooldown expires', async () => {
      fields.retryAt = Date.now() + 120000;
      const lambdaFunc = jest.fn(async ({ eventKey }) => {
        fields[eventKey] = success;
      });
      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(119999);
      expect(lambdaFunc).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(lambdaFunc).toHaveBeenCalledTimes(1);
      await jest.runAllTimersAsync();
      await pending;
    });

    it.each([undefined, 999999])('dispatches immediately for retryAt=%s', async retryAt => {
      fields.retryAt = retryAt;
      const lambdaFunc = jest.fn(async ({ eventKey }) => {
        fields[eventKey] = success;
      });
      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(0);
      expect(lambdaFunc).toHaveBeenCalledTimes(1);
      await jest.runAllTimersAsync();
      await pending;
    });

    it.each([15000, 120000])('retries at the deadline after a %i ms cooldown', async delay => {
      const lambdaFunc = jest.fn(async ({ eventKey }) => {
        if (lambdaFunc.mock.calls.length === 1) {
          fields.retryAt = Date.now() + delay;
          fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
        } else {
          fields[eventKey] = success;
        }
      });
      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(lambdaFunc).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(lambdaFunc).toHaveBeenCalledTimes(2);
      await jest.runAllTimersAsync();
      await pending;
    });
  });

  it('rechecks the deadline after sleeping in case another request extended it', async () => {
    fields.retryAt = Date.now() + 30000;
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      fields[eventKey] = success;
    });
    const pending = runners[0].run(lambdaFunc);

    await jest.advanceTimersByTimeAsync(10000);
    fields.retryAt = Date.now() + 120000;
    await jest.advanceTimersByTimeAsync(119999);
    expect(lambdaFunc).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(lambdaFunc).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    await pending;
  });

  describe.each(batchRunners)('$name batches', ({ run, firstBatchSize, total }) => {
    const batchResult = ({ page, parentId }) => ({
      message: 'Synced',
      result: {
        result: [parentId ?? page - 1],
        hasMore: parentId === undefined && page === 1,
      },
    });
    const expectedRecords = Array.from({ length: total }, (_, index) => index);

    it('reads retryAt once per concurrent group', async () => {
      const lambdaFunc = jest.fn(async args => {
        fields[args.eventKey] = batchResult(args);
      });
      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(0);
      expect(lambdaFunc).toHaveBeenCalledTimes(firstBatchSize);
      expect(cooldownReads()).toBe(1);
      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
      expect(lambdaFunc).toHaveBeenCalledTimes(total);
      expect(cooldownReads()).toBe(2);
    });

    it('finishes dispatching the current group and waits before the next group', async () => {
      const lambdaFunc = jest.fn(async args => {
        fields[args.eventKey] = batchResult(args);
        if (lambdaFunc.mock.calls.length === 1) {
          fields.retryAt = Date.now() + 120000;
        }
      });
      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(119999);
      expect(lambdaFunc).toHaveBeenCalledTimes(firstBatchSize);
      expect(cooldownReads()).toBe(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(lambdaFunc).toHaveBeenCalledTimes(total);
      expect(cooldownReads()).toBe(3); // Recheck once after the cooldown expires.
      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
    });

    it('waits for retryAt before retrying the entire failed group with one shared check', async () => {
      const lambdaFunc = jest.fn(async args => {
        if (lambdaFunc.mock.calls.length === firstBatchSize + 1) {
          fields.retryAt = Date.now() + 120000;
          fields[args.eventKey] = { error: true, message: TIMEOUT_MESSAGE };
        } else {
          fields[args.eventKey] = batchResult(args);
        }
      });
      const pending = run(lambdaFunc);

      // The second group starts after the first group's 3-second result poll.
      await jest.advanceTimersByTimeAsync(122999);
      expect(lambdaFunc).toHaveBeenCalledTimes(total);
      expect(cooldownReads()).toBe(3);
      await jest.advanceTimersByTimeAsync(1);
      expect(lambdaFunc).toHaveBeenCalledTimes(total + total - firstBatchSize);
      expect(cooldownReads()).toBe(4);
      expect(lambdaFunc.mock.calls.slice(total)).toEqual(
        lambdaFunc.mock.calls.slice(firstBatchSize, total)
      );
      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
    });
  });
});
