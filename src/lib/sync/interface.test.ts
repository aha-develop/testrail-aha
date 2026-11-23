import { TIMEOUT_MESSAGE, formatTimeoutMessage, fetchTestRail } from '../api';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';
import { ExtensionRecord } from '../extensionRecord';
import { updateReferences } from './updateReferences';
import { linkRecords } from '../extensionFields/updates';
import { IDENTIFIER } from '../../extension';
import {
  waitForLambda,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';

jest.mock('../extensionFields/queries', () => ({
  getAccountExtensionFieldMap: jest.fn(),
}));

jest.mock('base64-js', () => ({
  __esModule: true,
  default: jest.requireActual('base64-js'),
}));

const runners = [
  {
    name: 'single request',
    run: lambdaFunc =>
      waitForLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'paged requests',
    run: lambdaFunc =>
      waitForPagedLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'indexed requests',
    run: lambdaFunc =>
      waitForIndexedLambda({
        eventKey: 'sync',
        args: {},
        lambdaFunc,
        numIds: 1,
        argFunc: index => ({ parentId: index }),
      }),
  },
];

const batchRunners = [
  {
    name: 'pages',
    firstBatchSize: 1,
    total: 6,
    run: lambdaFunc =>
      waitForPagedLambda({ eventKey: 'sync', args: {}, lambdaFunc }),
  },
  {
    name: 'unpaged parents',
    firstBatchSize: 50,
    total: 55,
    run: lambdaFunc =>
      waitForPagedLambda({
        eventKey: 'sync',
        args: {},
        lambdaFunc,
        usePage: false,
        idKey: 'parentId',
        ids: Array.from({ length: 55 }, (_, index) => index),
      }),
  },
  {
    name: 'indexed parents',
    firstBatchSize: 50,
    total: 55,
    run: lambdaFunc =>
      waitForIndexedLambda({
        eventKey: 'sync',
        args: {},
        lambdaFunc,
        numIds: 55,
        argFunc: index => ({ parentId: index }),
      }),
  },
];

describe('sync API cooldown', () => {
  let fields: { [key: string]: any };
  const cooldownReads = () =>
    (getAccountExtensionFieldMap as jest.Mock).mock.calls.filter(([keys]) =>
      keys.includes('retryAt')
    ).length;
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
      Object.fromEntries(
        keys
          .filter(key => fields[key] !== undefined)
          .map(key => [key, fields[key]])
      )
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('reference update batches', () => {
    const record = {
      id: '100',
      typename: 'Feature',
      referenceNum: 'ABC-1',
      loadAttributes: async () => {},
    } as unknown as ExtensionRecord;
    const ids = Array.from({ length: 23 }, (_, index) => index + 1);
    let triggerServer: jest.Mock;

    beforeEach(() => {
      triggerServer = jest.fn(async (_event, { eventKey }) => {
        fields[eventKey] = success;
      });
      Object.assign(aha, {
        settings: { get: () => true },
        triggerServer,
      });
    });

    it('dispatches at most five cases per batch and polls their results together', async () => {
      const pending = updateReferences(record, [...ids, 1], 'add');

      await jest.advanceTimersByTimeAsync(0);
      expect(triggerServer).toHaveBeenCalledTimes(5);
      expect(cooldownReads()).toBe(1);

      await jest.advanceTimersByTimeAsync(3000);
      expect(triggerServer).toHaveBeenCalledTimes(10);
      expect(getAccountExtensionFieldMap).toHaveBeenCalledWith(
        triggerServer.mock.calls.slice(0, 5).map(([, args]) => args.eventKey)
      );

      await jest.advanceTimersByTimeAsync(3000);
      expect(triggerServer).toHaveBeenCalledTimes(15);

      await jest.runAllTimersAsync();
      await pending;
      expect(cooldownReads()).toBe(5);
      expect(triggerServer.mock.calls.map(([, args]) => args.caseId)).toEqual(ids);
      expect(fields).toEqual({});
    });

    it('links successful cases across batches before reporting errors, including late successes', async () => {
      triggerServer.mockImplementation(async (_event, { caseId, eventKey }) => {
        if (caseId === 1) {
          fields[eventKey] = { error: true, message: 'Permission denied' };
        } else if (caseId === 2) {
          setTimeout(() => {
            fields[eventKey] = success;
          }, 10000);
        } else {
          fields[eventKey] = success;
        }
      });
      const setExtensionField = jest.fn(async () => {});
      const linkRecord = {
        ...record,
        getExtensionField: async () => [100],
        setExtensionField,
      } as unknown as ExtensionRecord;
      let settled = false;
      const pending = expect(linkRecords(linkRecord, ids, 'caseIds'))
        .rejects.toThrow('Permission denied')
        .then(() => {
        settled = true;
      });

      await jest.advanceTimersByTimeAsync(9999);
      expect(triggerServer).toHaveBeenCalledTimes(5);
      expect(settled).toBe(false);
      // Only the pre-dispatch cleanup has run; pending results remain available.
      expect(aha.account.clearExtensionField).toHaveBeenCalledTimes(5);

      await jest.runAllTimersAsync();
      await pending;
      expect(triggerServer).toHaveBeenCalledTimes(23);
      expect(setExtensionField).toHaveBeenCalledWith(
        IDENTIFIER, 'caseIds', [100, ...ids.filter(id => id !== 1)]
      );
      expect(fields).toEqual({});
    });

    it('retries only rate-limited cases before starting the next batch', async () => {
      triggerServer.mockImplementation(async (_event, { caseId, eventKey }) => {
        if (caseId === 2 && triggerServer.mock.calls.length === 2) {
          fields.retryAt = Date.now() + 120000;
          fields[eventKey] = {
            error: true,
            message: formatTimeoutMessage(fields.retryAt),
          };
        } else {
          fields[eventKey] = success;
        }
      });
      const pending = updateReferences(record, ids, 'add');

      await jest.advanceTimersByTimeAsync(119999);
      expect(triggerServer).toHaveBeenCalledTimes(5);

      await jest.advanceTimersByTimeAsync(1);
      expect(triggerServer).toHaveBeenCalledTimes(6);
      expect(triggerServer.mock.calls[5]).toEqual(triggerServer.mock.calls[1]);

      await jest.runAllTimersAsync();
      await pending;
      expect(triggerServer).toHaveBeenCalledTimes(24);
      expect(
        triggerServer.mock.calls.slice(6).map(([, args]) => args.caseId)
      ).toEqual(ids.slice(5));
      expect(Object.keys(fields)).toEqual(['retryAt']);
    });
  });

  describe('partial reference results', () => {
    const record = {
      id: '100',
      typename: 'Feature',
      referenceNum: 'ABC-1',
      loadAttributes: async () => {},
    } as unknown as ExtensionRecord;

    it('retains confirmed successes when another case never returns', async () => {
      Object.assign(aha, {
        settings: { get: () => true },
        triggerServer: jest.fn(async (_event, { caseId, eventKey }) => {
          if (caseId === 1) fields[eventKey] = success;
        }),
      });
      const pending = expect(updateReferences(record, [1, 2], 'add'))
        .rejects.toMatchObject({
          successfulCaseIds: [1],
          message: expect.stringContaining('C2: Timeout waiting for lambda'),
        });
      await jest.runAllTimersAsync();
      await pending;
      expect(fields).toEqual({});
    });

    it('retries rate-limited cases even when another case has a permanent error', async () => {
      const attempts: Record<number, number> = {};
      Object.assign(aha, {
        settings: { get: () => true },
        triggerServer: jest.fn(async (_event, { caseId, eventKey }) => {
          attempts[caseId] = (attempts[caseId] || 0) + 1;
          if (caseId === 1) {
            fields[eventKey] = { error: true, message: 'Permission denied' };
          } else if (caseId === 2 && attempts[caseId] === 1) {
            fields[eventKey] = {
              error: true,
              message: formatTimeoutMessage(Date.now() + 5000),
            };
          } else {
            fields[eventKey] = success;
          }
        }),
      });
      const pending = expect(updateReferences(record, [1, 2, 3], 'add'))
        .rejects.toMatchObject({
          successfulCaseIds: [2, 3],
          message: 'Could not sync reference for test case C1: Permission denied',
        });
      await jest.runAllTimersAsync();
      await pending;
      expect(attempts).toEqual({ 1: 1, 2: 2, 3: 1 });
      expect(fields).toEqual({});
    });
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

    it.each([undefined, 999999])(
      'dispatches immediately for retryAt=%s',
      async retryAt => {
        fields.retryAt = retryAt;

        const lambdaFunc = jest.fn(async ({ eventKey }) => {
          fields[eventKey] = success;
        });

        const pending = run(lambdaFunc);

        await jest.advanceTimersByTimeAsync(0);
        expect(lambdaFunc).toHaveBeenCalledTimes(1);

        await jest.runAllTimersAsync();
        await pending;
      }
    );

    it.each([15000, 120000])(
      'retries at the deadline after a %i ms cooldown',
      async delay => {
        const lambdaFunc = jest.fn(async ({ eventKey }) => {
          if (lambdaFunc.mock.calls.length === 1) {
            fields.retryAt = Date.now() + delay;
            fields[eventKey] = {
              error: true,
              message: formatTimeoutMessage(fields.retryAt),
            };
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
      }
    );

    it.each([undefined, 999999])(
      'honors the message deadline when shared retryAt is %s',
      async sharedRetryAt => {
        fields.retryAt = sharedRetryAt;

        const lambdaFunc = jest.fn(async ({ eventKey }) => {
          fields[eventKey] =
            lambdaFunc.mock.calls.length === 1
              ? { error: true, message: formatTimeoutMessage(1120000) }
              : success;
        });

        const pending = run(lambdaFunc);

        await jest.advanceTimersByTimeAsync(119999);
        expect(lambdaFunc).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1);
        expect(lambdaFunc).toHaveBeenCalledTimes(2);

        await jest.runAllTimersAsync();
        await pending;
      }
    );

    it('does not add a fallback wait when the embedded deadline has already passed', async () => {
      const lambdaFunc = jest.fn(async ({ eventKey }) => {
        fields[eventKey] =
          lambdaFunc.mock.calls.length === 1
            ? { error: true, message: formatTimeoutMessage(1001000) }
            : success;
      });

      const pending = run(lambdaFunc);

      await jest.advanceTimersByTimeAsync(3000);
      expect(lambdaFunc).toHaveBeenCalledTimes(2);

      await jest.runAllTimersAsync();
      await pending;
    });

    it.each([
      TIMEOUT_MESSAGE,
      'API limit reached. Please try again in a few minutes.',
      `${TIMEOUT_MESSAGE} [retryAt=invalid]`,
      `${TIMEOUT_MESSAGE} [retryAt=-1]`,
      `${TIMEOUT_MESSAGE} [retryAt=99999999999999999999]`,
    ])(
      'waits 60 seconds from reading an unparseable timeout: %s',
      async message => {
        const lambdaFunc = jest.fn(async ({ eventKey }) => {
          fields[eventKey] =
            lambdaFunc.mock.calls.length === 1
              ? { error: true, message }
              : success;
        });

        const pending = run(lambdaFunc);

        // The first result is read at 3 seconds. The fallback is fixed at 63
        // seconds and must not move forward each time the cooldown is checked.
        await jest.advanceTimersByTimeAsync(62999);
        expect(lambdaFunc).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1);
        expect(lambdaFunc).toHaveBeenCalledTimes(2);

        await jest.runAllTimersAsync();
        await pending;
      }
    );
  });

  it('waits for the embedded deadline when the result is visible before retryAt', async () => {
    const originalFetch = global.fetch;
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const serverJobs: Promise<any>[] = [];
    const requestTimes: number[] = [];
    (aha as any).settings = { get: () => 'test' };

    aha.account.setExtensionField = jest.fn(
      async (_identifier, key, value) => {
        // The concurrent writes need not become readable together. Model the
        // result arriving before the shared cooldown explicitly.
        if (key === 'retryAt') {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        fields[key] = value;
      }
    );

    global.fetch = jest.fn(async () => {
      requestTimes.push(Date.now());
      return requestTimes.length === 1
        ? { ok: false, status: 429, headers: { get: () => '120' } }
        : { ok: true, json: async () => ({ id: 1 }) };
    }) as any;

    const lambdaFunc = async ({ eventKey }) => {
      // Dispatch acknowledgement does not wait for the server handler.
      serverJobs.push(
        fetchTestRail({
          path: 'get_projects',
          eventKey,
          record: aha.account,
        }).then(result => {
          if (result) fields[eventKey] = success;
        })
      );
    };

    try {
      const pending = runners[0].run(lambdaFunc);
      await jest.advanceTimersByTimeAsync(3000);
      expect(fields.retryAt).toBeUndefined();
      expect(requestTimes).toEqual([1000000]);

      await jest.advanceTimersByTimeAsync(116999);
      expect(requestTimes).toEqual([1000000]);

      await jest.advanceTimersByTimeAsync(1);
      expect(requestTimes).toEqual([1000000, 1120000]);

      await jest.runAllTimersAsync();
      expect(await pending).toEqual(success);

      await Promise.all(serverJobs);
      expect(aha.account.setExtensionField).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('uses the longest result deadline and rechecks extensions to the shared deadline', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey, parentId }) => {
      fields[eventKey] =
        lambdaFunc.mock.calls.length <= 2
          ? {
              error: true,
              message: formatTimeoutMessage(
                1000000 + (parentId ? 30000 : 15000)
              ),
            }
          : success;
    });

    const pending = waitForIndexedLambda({
      eventKey: 'sync',
      args: {},
      lambdaFunc,
      numIds: 2,
      argFunc: index => ({ parentId: index }),
    });

    await jest.advanceTimersByTimeAsync(20000);
    expect(lambdaFunc).toHaveBeenCalledTimes(2);

    fields.retryAt = 1120000;
    await jest.advanceTimersByTimeAsync(99999);
    expect(lambdaFunc).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1);
    expect(lambdaFunc).toHaveBeenCalledTimes(4);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual(['record', 'record']);
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

  describe.each(batchRunners)(
    '$name batches',
    ({ run, firstBatchSize, total }) => {
      const batchResult = ({ page, parentId }) => ({
        message: 'Synced',
        result: {
          result: [parentId ?? page - 1],
          hasMore: parentId === undefined && page === 1,
        },
      });

      const expectedRecords = Array.from(
        { length: total },
        (_, index) => index
      );

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
          if (
            [firstBatchSize + 1, firstBatchSize + 3].includes(
              lambdaFunc.mock.calls.length
            )
          ) {
            fields.retryAt = Date.now() + 120000;
            fields[args.eventKey] = {
              error: true,
              message: formatTimeoutMessage(fields.retryAt),
            };
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
          const attempt = (attempts[id] = (attempts[id] || 0) + 1);

          if (
            (id === firstBatchSize && attempt === 1) ||
            (id === firstBatchSize + 2 && attempt <= 2)
          ) {
            fields.retryAt = Date.now() + 15000;
            fields[args.eventKey] = {
              error: true,
              message: formatTimeoutMessage(fields.retryAt),
            };
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
            fields[args.eventKey] = {
              error: true,
              message: formatTimeoutMessage(fields.retryAt),
            };
          } else if (call === firstBatchSize + 2) {
            lateKey = args.eventKey;
            setTimeout(() => {
              fields[lateKey] = batchResult(args);
            }, 15000);
          } else {
            fields[args.eventKey] = batchResult(args);
          }
        });

        const pending = run(lambdaFunc);

        // The cooldown expires at 8 seconds, but the late request finishes at 18.
        await jest.advanceTimersByTimeAsync(17999);
        expect(lambdaFunc).toHaveBeenCalledTimes(total);
        expect(aha.account.clearExtensionField).not.toHaveBeenCalledWith(
          expect.any(String),
          lateKey
        );

        const polls = (getAccountExtensionFieldMap as jest.Mock).mock.calls;
        expect(polls[polls.length - 1][0]).toEqual([lateKey]);

        await jest.runAllTimersAsync();
        expect(await pending).toEqual(expectedRecords);
        expect(lambdaFunc).toHaveBeenCalledTimes(total + 1);
        expect(lambdaFunc.mock.calls[total]).toEqual(
          lambdaFunc.mock.calls[firstBatchSize]
        );
        expect(cooldownReads()).toBe(3);
      });

      it('stops on a non-rate-limit error even when another request is rate-limited', async () => {
        const lambdaFunc = jest.fn(async args => {
          const call = lambdaFunc.mock.calls.length;

          if (call === firstBatchSize + 1) {
            fields.retryAt = Date.now() + 120000;
            fields[args.eventKey] = {
              error: true,
              message: formatTimeoutMessage(fields.retryAt),
            };
          } else if (call === firstBatchSize + 2) {
            fields[args.eventKey] = {
              error: true,
              message: 'Invalid credentials',
            };
          } else {
            fields[args.eventKey] = batchResult(args);
          }
        });

        const pending = expect(run(lambdaFunc)).rejects.toThrow(
          'Invalid credentials'
        );

        await jest.runAllTimersAsync();
        await pending;

        expect(lambdaFunc).toHaveBeenCalledTimes(total);
        expect(cooldownReads()).toBe(2);
        expect(Object.keys(fields)).toEqual(['retryAt']);
      });
    }
  );

  it('uses the last original page to decide whether to continue after out-of-order results and retries', async () => {
    let retried = false;

    const lambdaFunc = jest.fn(async ({ eventKey, page }) => {
      if (page === 2 && !retried) {
        retried = true;
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = {
          error: true,
          message: formatTimeoutMessage(fields.retryAt),
        };
      } else {
        // Return the final page first, so neither response order nor retry order
        // can be used to decide which page's hasMore flag governs the next batch.
        setTimeout(
          () => {
            fields[eventKey] = {
              message: 'Synced',
              result: { result: [page], hasMore: page < 6 },
            };
          },
          page === 6 ? 0 : 1000
        );
      }
    });

    const pending = runners[1].run(lambdaFunc);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lambdaFunc.mock.calls.map(([args]) => args.page)).toEqual([
      1, 2, 3, 4, 5, 6, 2,
    ]);
  });

  it('does not retry missing results when a batch reaches its polling timeout', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey, parentId }) => {
      if (parentId === 0) {
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = {
          error: true,
          message: formatTimeoutMessage(fields.retryAt),
        };
      }
      // Parent 1 never reports a result.
    });

    const pending = expect(
      waitForIndexedLambda({
        eventKey: 'sync',
        args: {},
        lambdaFunc,
        numIds: 2,
        argFunc: index => ({ parentId: index }),
      })
    ).rejects.toThrow('Timeout waiting for lambda to complete');

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
        fields[eventKey] = {
          error: true,
          message: formatTimeoutMessage(fields.retryAt),
        };
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
        fields[eventKey] = {
          error: true,
          message: formatTimeoutMessage(fields.retryAt),
        };
      } else {
        fields[eventKey] = success;
      }
    });

    const pending = waitForIndexedLambda({
      eventKey: 'sync',
      args: {},
      lambdaFunc,
      numIds: 3,
      argFunc: index => ({ parentId: index }),
    });

    await jest.advanceTimersByTimeAsync(14999);
    expect(lambdaFunc).toHaveBeenCalledTimes(3);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual(['record', 'record', 'record']);
    expect(lambdaFunc).toHaveBeenCalledTimes(6);
    expect(lambdaFunc.mock.calls.slice(3)).toEqual(
      lambdaFunc.mock.calls.slice(0, 3)
    );
    expect(cooldownReads()).toBe(3);
  });

  it('stops when a selective retry returns a non-rate-limit error', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey, parentId }) => {
      if (lambdaFunc.mock.calls.length === 4) {
        fields[eventKey] = { error: true, message: 'Invalid credentials' };
      } else if (parentId === 1) {
        fields.retryAt = Date.now() + 15000;
        fields[eventKey] = {
          error: true,
          message: formatTimeoutMessage(fields.retryAt),
        };
      } else {
        fields[eventKey] = success;
      }
    });

    const pending = expect(
      waitForIndexedLambda({
        eventKey: 'sync',
        args: {},
        lambdaFunc,
        numIds: 3,
        argFunc: index => ({ parentId: index }),
      })
    ).rejects.toThrow('Invalid credentials');

    await jest.runAllTimersAsync();
    await pending;

    expect(lambdaFunc).toHaveBeenCalledTimes(4);
    expect(lambdaFunc.mock.calls[3]).toEqual(lambdaFunc.mock.calls[1]);
    expect(Object.keys(fields)).toEqual(['retryAt']);
  });

  it('returns a non-rate-limit error for a single request without retrying', async () => {
    const error = { error: true, message: 'Invalid credentials' };
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      fields[eventKey] = error;
    });
    const pending = runners[0].run(lambdaFunc);

    await jest.runAllTimersAsync();
    expect(await pending).toEqual(error);
    expect(lambdaFunc).toHaveBeenCalledTimes(1);
  });

  it('fails when the first paged request returns a non-rate-limit error', async () => {
    const lambdaFunc = jest.fn(async ({ eventKey }) => {
      fields[eventKey] = { error: true, message: 'Invalid credentials' };
    });

    const pending = expect(runners[1].run(lambdaFunc)).rejects.toThrow(
      'Invalid credentials'
    );

    await jest.runAllTimersAsync();
    await pending;
    expect(lambdaFunc).toHaveBeenCalledTimes(1);
  });
});
