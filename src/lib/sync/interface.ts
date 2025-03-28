import { IDENTIFIER } from '../../extension';

import { TIMEOUT_MESSAGE, RETRY_WAIT, APIResult, PagedAPIResult } from '../api';
import { sleep } from '../util';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';

// The lambda can only run for up to 10 seconds, but can take some time to spin up on a cold start
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

type MaybeMappedResult =
  | LambdaResult[]
  | { [key: string]: LambdaResult }
  | null;

const waitForResults: (
  eventKeys: string[],
  returnMap?: boolean
) => Promise<MaybeMappedResult> = async (eventKeys, returnMap) => {
  const initialTime = Date.now();

  let error: string | null = null;
  let timedOut = false;

  // Wait a little longer before first poll as the lambda has to spin up
  await sleep(INIT_WAIT_TIME);

  while (Date.now() - initialTime < MAX_POLL_TIME) {
    const results = await getAccountExtensionFieldMap<LambdaResult>(eventKeys);

    for (const eventKey in results) {
      const result = results[eventKey];

      if (result?.message) {
        if (result.error && result.message === TIMEOUT_MESSAGE) {
          timedOut = true;
        } else if (result.error) {
          error = result.message;
          break;
        }
      }
    }

    // Any error, including timeout, invalidates the whole batch
    if (error || timedOut) {
      for (const key of eventKeys) {
        await aha.account.clearExtensionField(IDENTIFIER, key);
      }
    }

    if (error) {
      const errors = eventKeys.reduce((acc, key) => {
        acc[key] = {
          error: true,
          message: error,
        };

        return acc;
      }, {});

      if (returnMap) return errors;

      return Object.values(errors);
    }

    if (timedOut) {
      await sleep(RETRY_WAIT * 1000);
      return null;
    }

    const arrayResults = Object.values(results);

    if (
      arrayResults.length === eventKeys.length &&
      arrayResults.every(result => result?.message)
    ) {
      for (const key of eventKeys) {
        await aha.account.clearExtensionField(IDENTIFIER, key);
      }

      if (returnMap) return results;

      return arrayResults;
    }

    await sleep(INTERVAL_TIME);
  }

  const errors = eventKeys.reduce((acc, key) => {
    acc[key] = {
      error: true,
      message: 'Timeout waiting for lambda to complete - please try again',
    };

    return acc;
  }, {});

  for (const key of eventKeys) {
    await aha.account.clearExtensionField(IDENTIFIER, key);
  }

  if (returnMap) return errors;

  return Object.values(errors);
};

// Returns a promise that either resolves or raises an error with the error message from the API
export const waitForLambda: <T extends LambdaResult>(
  props: WaitProps
) => Promise<T> = async <T extends LambdaResult>({
  eventKey,
  lambdaFunc,
  args,
}) => {
  let result: T[] | null = null;

  // Possible in the case of a failed cleanup
  await aha.account.clearExtensionField(IDENTIFIER, eventKey);

  while (!result) {
    await lambdaFunc({
      ...args,
      eventKey,
    });

    // No result means we timed out, so we have to re-call the lambda
    result = (await waitForResults([eventKey])) as T[];
  }

  return result[0];
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
    await lambdaFunc({
      ...lambdaArgs,
      eventKey: pagedKey,
    });

    page++;
  }

  let fetchResults = (await waitForResults(eventKeys)) as null | LambdaResult[];

  while (!fetchResults) {
    for (const key of eventKeys) {
      await lambdaFunc({
        ...argsForKeys[key],
        eventKey: key,
      });
    }

    fetchResults = (await waitForResults(eventKeys)) as null | LambdaResult[];
  }

  argsForKeys = {}; // Reset for next batch
  let error = fetchResults.find(result => result.error)?.message;
  let hasMore = true;

  // Slightly different handling because paged and unpaged results have a different structure
  if (isPaginated && usePage) {
    hasMore = fetchResults[fetchResults.length - 1].result?.hasMore;
    results.push(
      ...fetchResults.flatMap(
        result => (result as PagedAPIResult).result?.result ?? []
      )
    );
  } else {
    hasMore = page <= ids.length;
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
      await lambdaFunc({
        ...lambdaArgs,
        eventKey: pagedKey,
      });

      page++;
    }

    // Circuit break in the event hasMore was set incorrectly
    if (eventKeys.length === 0) break;

    fetchResults = (await waitForResults(eventKeys)) as null | LambdaResult[];

    while (!fetchResults) {
      for (const key of eventKeys) {
        await lambdaFunc({
          ...argsForKeys[key],
          eventKey: key,
        });
      }

      fetchResults = (await waitForResults(eventKeys)) as null | LambdaResult[];
    }

    argsForKeys = {};

    error = fetchResults.find(result => result.error)?.message;

    if (error) throw new Error(error);

    if (isPaginated && usePage) {
      hasMore = fetchResults[fetchResults.length - 1].result?.hasMore;
      results.push(
        ...fetchResults.flatMap(
          result => (result as PagedAPIResult).result?.result ?? []
        )
      );
    } else {
      hasMore = page <= ids.length;
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
        await lambdaFunc({
          ...lambdaArgs,
          eventKey: pagedKey,
        });
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

  let fetchResults = (await waitForResults(eventKeys, true)) as null | {
    [key: string]: PagedAPIResult;
  };

  while (!fetchResults) {
    for (const key of eventKeys) {
      await lambdaFunc({
        ...argsForKeys[key],
        eventKey: key,
      });
    }

    fetchResults = (await waitForResults(eventKeys, true)) as null | {
      [key: string]: PagedAPIResult;
    };
  }

  const error = Object.values(fetchResults).find(
    result => result.error
  )?.message;

  if (error) throw new Error(error);

  for (const key in fetchResults) {
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
