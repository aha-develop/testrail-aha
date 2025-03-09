import { IDENTIFIER, TestRun } from '../../extension';
import {
  BaseSyncProps,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';
import { saveRecords, saveNewRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed plans, to avoid loading up on historic data.
const NUM_COMPLETED_PLANS = 250;

type SyncPlanProps = BaseSyncProps & {
  projectIds: number[];
};

type SyncCompletedProps = BaseSyncProps & {
  projectIds: number[];
};

type SyncRunProps = BaseSyncProps & {
  planIds: number[];
  completed?: boolean;
};

export const syncOpenPlans: (
  props: SyncPlanProps
) => Promise<TestRun[]> = async ({ domain, projectIds, logger }) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, skipping open test plan sync.');
  }

  logger('Beginning load of open test plans from TestRail');

  const now = Date.now();

  let eventKey = `syncPlans-${Date.now()}`;

  const args = { domain, isCompleted: 0 };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncPlans`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching open test plans, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => ({ projectId: projectIds[index] });

  const openPlans = await waitForIndexedLambda<number>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: projectIds.length,
  });

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

  const now = Date.now();

  let eventKey = `syncCompletedPlans-${Date.now()}`;

  const args = { domain, isCompleted: 1, limit: NUM_COMPLETED_PLANS };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncPlans`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching completed test plans, pages ${firstPage} to ${lastPage}...`
    );
  };

  const planIds = await waitForPagedLambda<number>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    usePage: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  logger('Successfully fetched all completed test plans');

  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedPlanSync', now);
  return await syncRunsForPlan({ domain, planIds, logger, completed: true });
};

const syncRunsForPlan: (props: SyncRunProps) => Promise<TestRun[]> = async ({
  domain,
  planIds,
  logger,
  completed = false,
}) => {
  if (!planIds || planIds.length === 0) {
    logger('No test plans found, skipping test run sync.');
    return [];
  }

  logger('Beginning load of test runs for plans from TestRail.');

  const eventKey = `syncPlanRuns-${Date.now()}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRunsForPlan`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching test runs from plans, pages ${firstPage} to ${lastPage}...`
    );
  };

  let runs = await waitForPagedLambda<TestRun>({
    lambdaFunc,
    progressFunc,
    args: { domain },
    eventKey,
    usePage: false,
    isPaginated: false,
    idKey: 'planId',
    ids: planIds,
  });

  logger('Successfully fetched all test runs for plans');

  logger('Saving fetched test runs to Aha!');

  // When syncing completed plans, only save new records to reduce syncing effort.
  if (completed) {
    runs = await saveNewRecords<TestRun>(runs);
  } else {
    await saveRecords<TestRun>(runs);
  }
  logger('Successfully saved all test runs');

  return runs;
};
