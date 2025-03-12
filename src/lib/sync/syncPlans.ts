import { IDENTIFIER, TestRun } from '../../extension';
import {
  BaseSyncProps,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';
import { saveRecords, saveNewRuns } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed plans per project, to avoid loading up on historic data.
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
) => Promise<TestRun[]> = async ({ domain, projectIds }) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, skipping open test plan sync.');
  }

  const now = Date.now();

  let eventKey = `syncPlans-${Date.now()}`;

  const args = { domain, isCompleted: 0 };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncPlans`, args);
  };

  const argFunc = (index: number) => ({ projectId: projectIds[index] });

  const openPlans = await waitForIndexedLambda<number>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: projectIds.length,
  });

  await aha.account.setExtensionField(IDENTIFIER, 'lastPlanSync', now);
  return await syncRunsForPlan({ domain, planIds: openPlans });
};

// This stage is primarily useful for first sync to get historical data,
// or as a backup if a plan managed to open and close between syncs of open plans.
export const syncCompletedPlans: (
  props: SyncCompletedProps
) => Promise<TestRun[]> = async ({ domain, projectIds }) => {
  if (!projectIds?.length) {
    throw new Error(
      'No synced projects found, skipping completed test plan sync.'
    );
  }

  const now = Date.now();

  let eventKey = `syncCompletedPlans-${Date.now()}`;

  const args = { domain, isCompleted: 1, limit: NUM_COMPLETED_PLANS };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncPlans`, args);
  };

  const planIds = await waitForPagedLambda<number>({
    lambdaFunc,
    args,
    eventKey,
    usePage: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedPlanSync', now);
  return await syncRunsForPlan({ domain, planIds, completed: true });
};

const syncRunsForPlan: (props: SyncRunProps) => Promise<TestRun[]> = async ({
  domain,
  planIds,
  completed = false,
}) => {
  if (!planIds || planIds.length === 0) {
    return [];
  }

  const eventKey = `syncPlanRuns-${Date.now()}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRunsForPlan`, args);
  };

  let runs = await waitForPagedLambda<TestRun>({
    lambdaFunc,
    args: { domain },
    eventKey,
    usePage: false,
    isPaginated: false,
    idKey: 'planId',
    ids: planIds,
  });

  // When syncing completed plans, only save new records to reduce syncing effort.
  if (completed) {
    runs = await saveNewRuns(runs);
  } else {
    await saveRecords<TestRun>(runs);
  }

  return runs;
};
