import { IDENTIFIER, TestRun } from '../../extension';
import { PagedAPIResult } from '../api';
import { BaseSyncProps, waitForLambda, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed plans, to avoid loading up on historic data.
const NUM_COMPLETED_PLANS = 250;

type FetchProps = {
  domain: string;
  createdAfter?: number;
  projectId: string;
  isCompleted: boolean;
  logger: (message: string) => void;
};

type SyncPlanProps = BaseSyncProps & {
  lastPlanSync?: number;
  projectIds: string[];
};

type SyncCompletedProps = BaseSyncProps & {
  projectIds: string[];
};

type SyncRunProps = BaseSyncProps & {
  planIds: string[];
};

const fetchPlanIds: (props: FetchProps) => Promise<string[]> = async ({
  domain,
  createdAfter,
  projectId,
  isCompleted,
  logger,
}) => {
  let eventKey = `syncPlans${
    isCompleted ? 'Completed' : ''
  }_${projectId}-${Date.now()}`;

  const args = { domain, projectId };

  if (createdAfter && !isCompleted)
    args['createdAfter'] = Math.floor(createdAfter / 1000);
  if (isCompleted) {
    args['isCompleted'] = 1;
    args['limit'] = NUM_COMPLETED_PLANS;
  } else {
    args['isCompleted'] = 0;
  }

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncPlans`, args);
  };

  if (isCompleted) {
    logger(`Fetching completed test plans for project ${projectId}...`);

    const apiResult = await waitForLambda<PagedAPIResult>({
      lambdaFunc,
      args,
      eventKey,
    });

    if (apiResult.error) {
      throw new Error(apiResult.message);
    } else {
      return apiResult.result.result as string[];
    }
  } else {
    const progressFunc = async (firstPage, lastPage) => {
      logger(
        `Fetching open test plans, pages ${firstPage} to ${lastPage} for project ${projectId}...`
      );
    };

    return await waitForPagedLambda<string>({
      lambdaFunc,
      progressFunc,
      args,
      eventKey,
    });
  }
};

export const syncOpenPlans: (
  props: SyncPlanProps
) => Promise<TestRun[]> = async ({
  domain,
  projectIds,
  lastPlanSync,
  logger,
}) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, skipping open test plan sync.');
  }

  logger('Beginning load of open test plans from TestRail');

  const openPlans: string[] = [];
  const now = Date.now();

  for (const projectId of projectIds) {
    const results = await fetchPlanIds({
      domain,
      projectId,
      isCompleted: false,
      createdAfter: lastPlanSync,
      logger,
    });

    openPlans.push(...results);
  }

  logger('Successfully fetched all open test plans');

  await aha.account.setExtensionField(IDENTIFIER, 'lastPlanSync', now);
  return await syncRunsForPlan({ domain, planIds: openPlans, logger });
};

// This stage is primarily useful for first sync to get historical data,
// or as a backup if a plan managed to open and close between syncs of open plans.
export const syncCompletedPlans: (
  props: SyncCompletedProps
) => Promise<TestRun[]> = async ({ domain, projectIds, logger }) => {
  if (!projectIds?.length) {
    throw new Error(
      'No synced projects found, skipping completed test plan sync.'
    );
  }

  logger('Beginning load of completed test plans from TestRail');

  const completedRuns: string[] = [];
  const now = Date.now();

  for (const projectId of projectIds) {
    const results = await fetchPlanIds({
      domain,
      projectId,
      isCompleted: true,
      logger,
    });

    completedRuns.push(...results);
  }

  logger('Successfully fetched all completed test plans');

  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedPlanSync', now);
  return await syncRunsForPlan({ domain, planIds: completedRuns, logger });
};

const syncRunsForPlan: (props: SyncRunProps) => Promise<TestRun[]> = async ({
  domain,
  planIds,
  logger,
}) => {
  if (!planIds || planIds.length === 0) {
    logger('No test plans found, skipping test run sync.');
    return [];
  }

  logger('Beginning load of test runs for plans from TestRail.');

  const eventKey = 'syncPlanRuns';

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRunsForPlan`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching test runs from plans, pages ${firstPage} to ${lastPage}...`
    );
  };

  const runs = await waitForPagedLambda<TestRun>({
    lambdaFunc,
    progressFunc,
    args: { domain },
    eventKey,
    usePage: false,
    idKey: 'planId',
    ids: planIds,
  });

  logger('Successfully fetched all test runs for plans');

  logger('Saving fetched test runs to Aha!');
  await saveRecords<TestRun>(runs);
  logger('Successfully saved all test runs');

  return runs;
};
