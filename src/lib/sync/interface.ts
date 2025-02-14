import { IDENTIFIER } from '../../extension';

import { TIMEOUT_MESSAGE, RETRY_WAIT, APIResult, PagedAPIResult } from '../api';

// The lambda can only run for up to 10 seconds, but can take a few minutes to spin up under heavy load.
const MAX_POLL_TIME = 5 * 60 * 1000;
const INTERVAL_TIME = 1 * 1000;

// The TestRail API does not return total number of pages so this is a tradeoff between speed,
// number of API calls, and concurrent lambda requests, with an assumption that the number of pages
// is likely to be bi-modal - either very few (projects, open runs, tests/results per run)
// or many (test cases, completed test runs).
const INITIAL_CONCURRENCY = 1;
const CONCURRENCY = 4;

export type LambdaResult = APIResult | PagedAPIResult;

type WaitProps = {
  eventKey: string; // Key the lambda will write to
  lambdaFunc: (props: { [key: string]: any }) => Promise<void>;
  args: {
    [key: string]: any;
  };
};

type PagedWaitProps = WaitProps & {
  progressFunc: (firstPage: number, lastPage: number) => Promise<void>;
  usePage?: boolean;
  idKey?: string;
  ids?: string[];
};

const sleep: (timeout: number) => Promise<void> = timeout =>
  new Promise(resolve => setTimeout(resolve, timeout));

// Returns a promise that either resolves or raises an error with the error message from the API
export const waitForLambda: <T extends LambdaResult>(
  props: WaitProps
) => Promise<T> = <T extends LambdaResult>({ eventKey, lambdaFunc, args }) => {
  return new Promise<T>(async resolve => {
    let initialTime = Date.now();

    const oldValue = await aha.account.getExtensionField(IDENTIFIER, eventKey);

    // Possible if the wizard was interrupted before cleaning up
    if (oldValue) {
      await aha.account.clearExtensionField(IDENTIFIER, eventKey);
    }

    await lambdaFunc({
      ...args,
      eventKey,
    });

    while (Date.now() - initialTime < MAX_POLL_TIME) {
      await sleep(INTERVAL_TIME);
      const result = await aha.account.getExtensionField<LambdaResult>(
        IDENTIFIER,
        eventKey
      );

      if (result?.message) {
        if (result.error && result.message === TIMEOUT_MESSAGE) {
          await aha.account.clearExtensionField(IDENTIFIER, eventKey);
          await sleep(RETRY_WAIT * 1000);

          initialTime = Date.now(); // Reset the timer
          continue;
        }

        await aha.account.clearExtensionField(IDENTIFIER, eventKey); // Tidy up
        resolve(result as T);
      }
    }

    resolve({
      error: true,
      message: 'Timeout waiting for lambda to complete',
    } as T);
  });
};

// As above, but makes multiple calls to the lambda to fetch pages until there
// are no more to fetch or a call resolves with an error.
//
// If usePage is false, instead fetches child records in parallel for each parent ID.
// (For cases where we need to fetch per-parent pages, iterate through parent IDs fetching pages)
export const waitForPagedLambda: <T>(
  props: PagedWaitProps
) => Promise<T[]> = async <T>({
  eventKey,
  progressFunc,
  lambdaFunc,
  args,
  usePage = true,
  idKey,
  ids,
}) => {
  return new Promise<T[]>(async resolve => {
    let page = 1;

    const results = [] as T[];
    const promises = [];

    const concurrency = usePage ? INITIAL_CONCURRENCY : CONCURRENCY;

    for (let i = 0; i < concurrency && (!ids || page <= ids.length); i++) {
      const lambdaArgs = { ...args };

      if (usePage) {
        lambdaArgs.page = page;
      } else {
        lambdaArgs[idKey] = ids[page - 1];
      }

      promises[i] = waitForLambda<PagedAPIResult>({
        eventKey: `${eventKey}_parallel_${page}`,
        lambdaFunc,
        args: lambdaArgs,
      });

      page++;
    }

    let promiseResults = await Promise.all<LambdaResult[]>(promises);
    let error = promiseResults.find(result => result.error).message;
    let hasMore = true;

    // Slightly different handling because paged and unpaged results have a different structure
    if (usePage) {
      hasMore = promiseResults[promiseResults.length - 1].result?.hasMore;
      results.concat(
        promiseResults.flatMap(
          result => (result as PagedAPIResult).result?.result ?? []
        )
      );
    } else {
      hasMore = page <= ids.length;
      results.concat(
        promiseResults.flatMap(result => (result as APIResult).result ?? [])
      );
    }

    while (hasMore && !error) {
      for (let i = 0; i < CONCURRENCY && (!ids || page <= ids.length); i++) {
        const lambdaArgs = { ...args };

        if (usePage) {
          lambdaArgs.page = page;
        } else {
          lambdaArgs[idKey] = ids[page - 1];
        }
        promises[i] = waitForLambda<LambdaResult>({
          eventKey: `${eventKey}-parallel-${page}`,
          lambdaFunc,
          args: lambdaArgs,
        });

        page++;
      }

      progressFunc(1, page - 1);

      promiseResults = await Promise.all<LambdaResult>(promises);
      error = promiseResults.find(result => result.error).message;

      // Slightly different handling because paged and unpaged results have a different structure
      if (usePage) {
        hasMore = promiseResults[promiseResults.length - 1].result?.hasMore;
        results.concat(
          promiseResults.flatMap(
            result => (result as PagedAPIResult).result?.result ?? []
          )
        );
      } else {
        hasMore = page <= ids.length;
        results.concat(
          promiseResults.flatMap(result => (result as APIResult).result ?? [])
        );
      }
    }

    if (error) {
      throw new Error(error);
    }

    resolve(results);
  });
};
