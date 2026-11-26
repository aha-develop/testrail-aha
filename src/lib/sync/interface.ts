import { IDENTIFIER } from '../../extension';

import {
  isTimeoutMessage,
  getTimeoutRetryAt,
  APIResult,
  PagedAPIResult,
} from '../api';
import { sleep } from '../util';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';

// The lambda can only run for up to 20 seconds, but can take some time to spin up on a cold start
// and tends to take longer with more concurrency.
const MAX_POLL_TIME = 5 * 60 * 1000;
const INIT_WAIT_TIME = 3 * 1000;
const INTERVAL_TIME = 1 * 1000;

// The TestRail API does not return total number of pages so this is a tradeoff between speed,
// number of API calls, and concurrent lambda requests, with an assumption that the number of pages
// is likely to be bi-modal - either very few (projects, open runs, tests/results per run)
// or many (test cases, tests, results).
const INITIAL_CONCURRENCY = 1;
const PAGED_CONCURRENCY = 5;

// Max number of concurrent requests to the lambda - should be kept low to
// avoid getting throttled by AWS.
const MAX_CONCURRENCY = 50;

export type LambdaResult = APIResult | PagedAPIResult;

export type BaseSyncProps = {
  domain: string;
};

type WaitProps = {
  eventKey: string; // Key the lambda will write to
  lambdaFunc: (props: { [key: string]: any }) => Promise<void>;
  args: {
    [key: string]: any;
  };
};

type IndexCallProps = {
  eventKeys: string[];
  lambdaFunc: (props: { [key: string]: any }) => Promise<void>;
  argsForKeys: { [key: string]: any };
};

type IndexedWaitProps = WaitProps & {
  argFunc: (index: number) => { [key: string]: any };
  numIds: number;
};

type PagedWaitProps = WaitProps & {
  usePage?: boolean;
  isPaginated?: boolean;
  idKey?: string;
  ids?: number[];
};

type LambdaResultMap = { [key: string]: LambdaResult };

export class BatchedMutationError extends Error {
  constructor(
    message: string,
    readonly results: LambdaResultMap
  ) {
    super(message);
    this.name = 'BatchedMutationError';
  }
}

const isRateLimited = (result: LambdaResult) =>
  result.error === true && isTimeoutMessage(result.message);

const callLambdaBatch = async ({
  lambdaFunc,
  eventKeys,
  argsForKeys,
  minimumRetryAt = 0,
  waitForAll = false,
}: IndexCallProps & { minimumRetryAt?: number; waitForAll?: boolean }) => {
  // Check the group being dispatched, including any selective retries,
  // then loop in case another request triggered an API timeout.
  while (true) {
    const { retryAt } = await getAccountExtensionFieldMap<number>(['retryAt']);
    const delay = Math.max(minimumRetryAt, retryAt || 0) - Date.now();

    if (!(delay > 0)) break;

    await sleep(delay);
  }

  const dispatchErrors: LambdaResultMap = {};
  for (const eventKey of eventKeys) {
    try {
      await lambdaFunc({ ...argsForKeys[eventKey], eventKey });
    } catch (error) {
      if (!waitForAll) throw error;
      // One failed dispatch must not prevent polling the other mutations.
      dispatchErrors[eventKey] = {
        error: true,
        message: error.message || String(error),
      };
    }
  }
  return dispatchErrors;
};

const waitForResults = async (
  eventKeys: string[],
  waitForAll = false
): Promise<LambdaResultMap> => {
  const initialTime = Date.now();
  const results: LambdaResultMap = {};
  let error: string | null = null;

  // Wait a little longer before first poll as the lambda has to spin up
  await sleep(INIT_WAIT_TIME);

  while (Date.now() - initialTime < MAX_POLL_TIME) {
    const pendingKeys = eventKeys.filter(key => !results[key]);
    let fetched: LambdaResultMap;
    try {
      fetched = await getAccountExtensionFieldMap<LambdaResult>(pendingKeys);
    } catch (error) {
      if (!waitForAll) throw error;
      throw new BatchedMutationError(error.message || String(error), results);
    }

    for (const eventKey of pendingKeys) {
      const result = fetched[eventKey];

      if (result?.message) {
        results[eventKey] = result;

        if (result.error && !isRateLimited(result)) {
          error = result.message;
          if (!waitForAll) break;
        }
      }
    }

    // Bulk mutations (like reference updates) wait until all results are available,
    // so everything that was updated can be accounted for.
    // Bulk fetches can break immediately to re-run the batch.
    if ((!waitForAll && error) || eventKeys.every(key => results[key])) break;

    await sleep(INTERVAL_TIME);
  }

  const timeoutMessage =
    'Timeout waiting for lambda to complete - please try again';
  if (!error && eventKeys.some(key => !results[key])) {
    error = timeoutMessage;
  }

  for (const key of eventKeys) {
    try {
      await aha.account.clearExtensionField(IDENTIFIER, key);
    } catch (error) {
      if (!waitForAll) throw error;
      // Cleanup failure does not undo mutations confirmed by the poll.
      throw new BatchedMutationError(error.message || String(error), results);
    }
  }

  if (error) {
    return Object.fromEntries(
      eventKeys.map(key => [
        key,
        waitForAll && results[key]
          ? results[key]
          : { error: true, message: waitForAll ? timeoutMessage : error },
      ])
    );
  }

  return results;
};

const executeLambdaBatch = async ({
  eventKeys,
  lambdaFunc,
  argsForKeys,
  waitForAll = false,
}: IndexCallProps & { waitForAll?: boolean }): Promise<LambdaResultMap> => {
  const results: LambdaResultMap = {};
  let pendingKeys = eventKeys;
  let minimumRetryAt = 0;

  while (pendingKeys.length) {
    let attempt: LambdaResultMap = {};
    let dispatchErrors: LambdaResultMap = {};
    try {
      dispatchErrors = await callLambdaBatch({
        eventKeys: pendingKeys,
        lambdaFunc,
        argsForKeys,
        minimumRetryAt,
        waitForAll,
      });
      Object.assign(attempt, dispatchErrors);

      const dispatchedKeys = pendingKeys.filter(key => !attempt[key]);
      if (dispatchedKeys.length) {
        Object.assign(attempt, await waitForResults(dispatchedKeys, waitForAll));
      }
    } catch (error) {
      if (!waitForAll) throw error;

      // A retry can fail after other mutations have already succeeded.
      throw new BatchedMutationError(error.message || String(error), {
        ...results,
        ...attempt,
        ...(error instanceof BatchedMutationError ? error.results : {}),
      });
    }

    Object.assign(results, attempt);

    if (
      !waitForAll &&
      Object.values(attempt).some(
        result => result.error && !isRateLimited(result)
      )
    ) {
      return results;
    }

    // Identify results to retry, and get the max retry time from their responses.
    pendingKeys = pendingKeys.filter(
      key => !dispatchErrors[key] && isRateLimited(attempt[key])
    );
    minimumRetryAt = pendingKeys.reduce(
      (deadline, key) =>
        Math.max(deadline, getTimeoutRetryAt(attempt[key].message)),
      0
    );
  }

  return results;
};

// Returns the API result, automatically retrying rate-limited attempts.
export const waitForLambda: <T extends LambdaResult>(
  props: WaitProps
) => Promise<T> = async <T extends LambdaResult>({
  eventKey,
  lambdaFunc,
  args,
}) => {
  // Possible in the case of a failed cleanup
  await aha.account.clearExtensionField(IDENTIFIER, eventKey);

  const results = await executeLambdaBatch({
    lambdaFunc,
    eventKeys: [eventKey],
    argsForKeys: { [eventKey]: args },
  });

  return results[eventKey] as T;
};

// Runs a batch of lambda operations in parallel - as this is used for mutations,
// waits for all to complete before returning results.
export const waitForBatchedMutation = async <T extends LambdaResult>(
  props: IndexCallProps
): Promise<{ [key: string]: T }> => {
  await aha.account.clearExtensionFields(IDENTIFIER, props.eventKeys);

  return (await executeLambdaBatch({ ...props, waitForAll: true })) as {
    [key: string]: T;
  };
};

// As above, but makes multiple calls to the lambda to fetch pages until there
// are no more to fetch or a call resolves with an error.
//
// If usePage is false, instead fetches child records in parallel for each parent ID.
// If isPaginated is true then the lambda is expected to return a PagedAPIResult.
//
// If you want to fetch multiple pages per parent object use waitForIndexedLambda.
export const waitForPagedLambda: <T>(
  props: PagedWaitProps
) => Promise<T[]> = async <T>({
  eventKey,
  lambdaFunc,
  args,
  usePage = true,
  isPaginated = true,
  idKey,
  ids,
}) => {
  let page = 1;

  const results = [] as T[];
  let eventKeys = [];
  let argsForKeys = {};

  let concurrency = usePage ? INITIAL_CONCURRENCY : MAX_CONCURRENCY;

  for (let i = 0; i < concurrency && (!ids || page <= ids.length); i++) {
    const lambdaArgs = { ...args };

    if (usePage) {
      lambdaArgs.page = page;
    } else {
      lambdaArgs[idKey] = ids[page - 1];
    }

    const pagedKey = `${eventKey}_parallel_${page}`;

    eventKeys.push(pagedKey);
    argsForKeys[pagedKey] = lambdaArgs;
    page++;
  }

  let batchResults = await executeLambdaBatch({
    lambdaFunc,
    eventKeys,
    argsForKeys,
  });

  // Page order must be preserved even when earlier pages complete on a retry.
  let fetchResults = eventKeys.map(key => batchResults[key]);

  argsForKeys = {}; // Reset for next batch

  let error = fetchResults.find(result => result.error)?.message;
  if (error) throw new Error(error);

  let hasMore = true;
  if (isPaginated && usePage) {
    hasMore = fetchResults[fetchResults.length - 1].result?.hasMore;
  } else {
    hasMore = page <= ids.length;
  }

  // Slightly different handling because paged and unpaged results have a different structure
  if (isPaginated) {
    results.push(
      ...fetchResults.flatMap(
        result => (result as PagedAPIResult).result?.result ?? []
      )
    );
  } else {
    results.push(
      ...fetchResults.flatMap(result => (result as APIResult).result ?? [])
    );
  }

  concurrency = usePage ? PAGED_CONCURRENCY : MAX_CONCURRENCY;

  while (hasMore && !error) {
    eventKeys = [];

    for (let i = 0; i < concurrency && (!ids || page <= ids.length); i++) {
      const lambdaArgs = { ...args };

      if (usePage) {
        lambdaArgs.page = page;
      } else {
        lambdaArgs[idKey] = ids[page - 1];
      }

      const pagedKey = `${eventKey}_parallel_${page}`;

      eventKeys.push(pagedKey);
      argsForKeys[pagedKey] = lambdaArgs;
      page++;
    }

    // Circuit break in the event hasMore was set incorrectly
    if (eventKeys.length === 0) break;

    batchResults = await executeLambdaBatch({
      lambdaFunc,
      eventKeys,
      argsForKeys,
    });

    fetchResults = eventKeys.map(key => batchResults[key]);
    argsForKeys = {};

    error = fetchResults.find(result => result.error)?.message;
    if (error) throw new Error(error);

    if (isPaginated && usePage) {
      hasMore = fetchResults[fetchResults.length - 1].result?.hasMore;
    } else {
      hasMore = page <= ids.length;
    }

    if (isPaginated) {
      results.push(
        ...fetchResults.flatMap(
          result => (result as PagedAPIResult).result?.result ?? []
        )
      );
    } else {
      results.push(
        ...fetchResults.flatMap(result => (result as APIResult).result ?? [])
      );
    }
  }

  return results;
};

// For cases where we are iterating through a list of parent IDs and fetching pages for each
// (e.g. test results per test run) - fetches indexes in parallel
export const waitForIndexedLambda: <T>(
  props: IndexedWaitProps
) => Promise<T[]> = async <T>({
  eventKey,
  lambdaFunc,
  args,
  argFunc,
  numIds,
}) => {
  const results: T[] = [];
  let eventKeys: string[] = [];
  let finishedIds = new Set<string>();

  let page_concurrency = INITIAL_CONCURRENCY;
  let page = 1;

  // Required to recover in the case of a timeout
  let argsForKeys: { [key: string]: any } = {};

  while (finishedIds.size < numIds) {
    for (let index = 0; index < numIds; index++) {
      const indexString = index.toString();

      if (eventKeys.length >= MAX_CONCURRENCY) {
        const [newResults, newFinishedIds] = await makeIndexedCalls<T>({
          eventKeys,
          lambdaFunc,
          argsForKeys,
        });

        results.push(...newResults);
        for (const id of newFinishedIds) finishedIds.add(id);

        // Reset for next batch
        argsForKeys = {};
        eventKeys = [];
      }

      if (finishedIds.has(indexString)) continue;

      // Note we don't check for MAX_CONCURRENCY here because fetching more pages at once
      // is more efficient overall and MAX_CONCURRENCY isn't a hard limit
      for (
        let currentPage = page;
        currentPage < page + page_concurrency;
        currentPage++
      ) {
        const lambdaArgs = { ...args, page: currentPage };
        Object.assign(lambdaArgs, argFunc(index));

        // Finish with '-${id}' so we can easily extract the ID from the event key
        const pagedKey = `${eventKey}_parallel_${currentPage}-${indexString}`;

        eventKeys.push(pagedKey);
        argsForKeys[pagedKey] = lambdaArgs;
      }
    }

    page += page_concurrency;
    page_concurrency = PAGED_CONCURRENCY;

    if (eventKeys.length) {
      const [newResults, newFinishedIds] = await makeIndexedCalls<T>({
        eventKeys,
        lambdaFunc,
        argsForKeys,
      });

      results.push(...newResults);
      for (const id of newFinishedIds) finishedIds.add(id);

      argsForKeys = {};
      eventKeys = [];
    }
  }

  return results;
};

const makeIndexedCalls: <T>(
  props: IndexCallProps
) => Promise<[T[], string[]]> = async <T>({
  eventKeys,
  lambdaFunc,
  argsForKeys,
}) => {
  const results: T[] = [];
  const finishedIds: string[] = [];

  const fetchResults = (await executeLambdaBatch({
    lambdaFunc,
    eventKeys,
    argsForKeys,
  })) as {
    [key: string]: PagedAPIResult;
  };

  const error = Object.values(fetchResults).find(
    result => result.error
  )?.message;

  if (error) throw new Error(error);

  for (const key of eventKeys) {
    const result = fetchResults[key];

    results.push(...(result.result?.result ?? []));
    const hasMore = result.result?.hasMore;

    if (!hasMore) {
      const [parsedId] = key.split('-').slice(-1);
      finishedIds.push(parsedId);
    }
  }

  return [results, finishedIds];
};
