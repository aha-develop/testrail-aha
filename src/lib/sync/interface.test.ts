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

    it('waits for retryAt and retries only rate-limited requests with one shared check', async () => {
      const lambdaFunc = jest.fn(async args => {
        if ([firstBatchSize + 1, firstBatchSize + 3].includes(lambdaFunc.mock.calls.length)) {
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
      expect(lambdaFunc).toHaveBeenCalledTimes(total + 2);
      expect(cooldownReads()).toBe(4);
      expect(lambdaFunc.mock.calls.slice(total)).toEqual([
        lambdaFunc.mock.calls[firstBatchSize],
        lambdaFunc.mock.calls[firstBatchSize + 2],
      ]);
      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
    });

    it('retains successes across repeated rate limits and shrinks the retry group', async () => {
      const attempts: { [key: string]: number } = {};
      const lambdaFunc = jest.fn(async args => {
        const id = args.parentId ?? args.page - 1;
        const attempt = attempts[id] = (attempts[id] || 0) + 1;
        if ((id === firstBatchSize && attempt === 1) ||
            (id === firstBatchSize + 2 && attempt <= 2)) {
          fields.retryAt = Date.now() + 15000;
          fields[args.eventKey] = { error: true, message: TIMEOUT_MESSAGE };
        } else {
          fields[args.eventKey] = batchResult(args);
        }
      });
      const pending = run(lambdaFunc);

      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
      expect(lambdaFunc).toHaveBeenCalledTimes(total + 3);
      expect(lambdaFunc.mock.calls.slice(total)).toEqual([
        lambdaFunc.mock.calls[firstBatchSize],
        lambdaFunc.mock.calls[firstBatchSize + 2],
        lambdaFunc.mock.calls[firstBatchSize + 2],
      ]);
      expect(cooldownReads()).toBe(6);
      expect(Object.keys(fields)).toEqual(['retryAt']);
    });

    it('waits for late results without resending in-flight or successful requests', async () => {
      let lateKey: string;
      const lambdaFunc = jest.fn(async args => {
        const call = lambdaFunc.mock.calls.length;
        if (call === firstBatchSize + 1) {
          fields.retryAt = Date.now() + 5000;
          fields[args.eventKey] = { error: true, message: TIMEOUT_MESSAGE };
        } else if (call === firstBatchSize + 2) {
          lateKey = args.eventKey;
          setTimeout(() => { fields[lateKey] = batchResult(args); }, 15000);
        } else {
          fields[args.eventKey] = batchResult(args);
        }
      });
      const pending = run(lambdaFunc);

      // The cooldown expires at 8 seconds, but the late request finishes at 18.
      await jest.advanceTimersByTimeAsync(17999);
      expect(lambdaFunc).toHaveBeenCalledTimes(total);
      expect(aha.account.clearExtensionField).not.toHaveBeenCalledWith(
        expect.any(String), lateKey
      );
      const polls = (getAccountExtensionFieldMap as jest.Mock).mock.calls;
      expect(polls[polls.length - 1][0]).toEqual([lateKey]);
      await jest.runAllTimersAsync();
      expect(await pending).toEqual(expectedRecords);
      expect(lambdaFunc).toHaveBeenCalledTimes(total + 1);
      expect(lambdaFunc.mock.calls[total]).toEqual(lambdaFunc.mock.calls[firstBatchSize]);
      expect(cooldownReads()).toBe(3);
    });

    it('stops on a non-rate-limit error even when another request is rate-limited', async () => {
      const lambdaFunc = jest.fn(async args => {
        const call = lambdaFunc.mock.calls.length;
        if (call === firstBatchSize + 1) {
          fields.retryAt = Date.now() + 120000;
          fields[args.eventKey] = { error: true, message: TIMEOUT_MESSAGE };
        } else if (call === firstBatchSize + 2) {
          fields[args.eventKey] = { error: true, message: 'Invalid credentials' };
        } else {
          fields[args.eventKey] = batchResult(args);
        }
      });
      const pending = expect(run(lambdaFunc)).rejects.toThrow('Invalid credentials');

      await jest.runAllTimersAsync();
      await pending;
      expect(lambdaFunc).toHaveBeenCalledTimes(total);
      expect(cooldownReads()).toBe(2);
      expect(Object.keys(fields)).toEqual(['retryAt']);
    });
  });

  it('uses the last original page to decide whether to continue after out-of-order results and retries', async () => {
    let retried = false;
    const lambdaFunc = jest.fn(async ({ eventKey, page }) => {
      if (page === 2 && !retried) {
        retried = true;
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
      } else {
        // Return the final page first, so neither response order nor retry order
        // can be used to decide which page's hasMore flag governs the next batch.
        setTimeout(() => {
          fields[eventKey] = {
            message: 'Synced', result: { result: [page], hasMore: page < 6 },
          };
        }, page === 6 ? 0 : 1000);
      }
    });
    const pending = runners[1].run(lambdaFunc);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lambdaFunc.mock.calls.map(([args]) => args.page)).toEqual([1, 2, 3, 4, 5, 6, 2]);
  });

  it('does not retry missing results when a batch reaches its polling timeout', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey, parentId }) => {
      if (parentId === 0) {
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
      }
      // Parent 1 never reports a result.
    });
    const pending = expect(waitForIndexedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, numIds: 2,
      argFunc: index => ({ parentId: index }),
    })).rejects.toThrow('Timeout waiting for lambda to complete');

    await jest.runAllTimersAsync();
    await pending;
    expect(lambdaFunc).toHaveBeenCalledTimes(2);
    expect(cooldownReads()).toBe(1);
    expect(Object.keys(fields)).toEqual(['retryAt']);
  });

  it('does not count the cooldown towards the polling timeout', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      if (lambdaFunc.mock.calls.length === 1) {
        fields.retryAt = Date.now() + 600000;
        fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
      } else {
        fields[eventKey] = success;
      }
    });
    const pending = runners[0].run(lambdaFunc);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual(success);
    expect(lambdaFunc).toHaveBeenCalledTimes(2);
  });

  it('retries the full group when every request was rate-limited', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      if (lambdaFunc.mock.calls.length <= 3) {
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
      } else {
        fields[eventKey] = success;
      }
    });
    const pending = waitForIndexedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, numIds: 3,
      argFunc: index => ({ parentId: index }),
    });

    await jest.advanceTimersByTimeAsync(14999);
    expect(lambdaFunc).toHaveBeenCalledTimes(3);
    await jest.runAllTimersAsync();
    expect(await pending).toEqual(['record', 'record', 'record']);
    expect(lambdaFunc).toHaveBeenCalledTimes(6);
    expect(lambdaFunc.mock.calls.slice(3)).toEqual(lambdaFunc.mock.calls.slice(0, 3));
    expect(cooldownReads()).toBe(3);
  });

  it('stops when a selective retry returns a non-rate-limit error', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey, parentId }) => {
      if (lambdaFunc.mock.calls.length === 4) {
        fields[eventKey] = { error: true, message: 'Invalid credentials' };
      } else if (parentId === 1) {
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = { error: true, message: TIMEOUT_MESSAGE };
      } else {
        fields[eventKey] = success;
      }
    });
    const pending = expect(waitForIndexedLambda({
      eventKey: 'sync', args: {}, lambdaFunc, numIds: 3,
      argFunc: index => ({ parentId: index }),
    })).rejects.toThrow('Invalid credentials');

    await jest.runAllTimersAsync();
    await pending;
    expect(lambdaFunc).toHaveBeenCalledTimes(4);
    expect(lambdaFunc.mock.calls[3]).toEqual(lambdaFunc.mock.calls[1]);
    expect(Object.keys(fields)).toEqual(['retryAt']);
  });

  it('returns a non-rate-limit error for a single request without retrying', async () => {
    const error = { error: true, message: 'Invalid credentials' };
    const lambdaFunc = jest.fn(async ({ eventKey }) => { fields[eventKey] = error; });
    const pending = runners[0].run(lambdaFunc);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual(error);
    expect(lambdaFunc).toHaveBeenCalledTimes(1);
  });

  it('fails when the first paged request returns a non-rate-limit error', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      fields[eventKey] = { error: true, message: 'Invalid credentials' };
    });
    const pending = expect(runners[1].run(lambdaFunc)).rejects.toThrow('Invalid credentials');

    await jest.runAllTimersAsync();
    await pending;
    expect(lambdaFunc).toHaveBeenCalledTimes(1);
  });
});
