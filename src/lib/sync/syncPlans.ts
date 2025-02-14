import { IDENTIFIER, TestRun } from '../../extension';
import { PagedAPIResult } from '../api';
import { waitForLambda, waitForPagedLambda } from './interface';
import { SyncProps, SyncResult, SyncLogger } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed plans, to avoid loading up on historic data.
const MAX_COMPLETED_PLANS = 250;

type FetchProps = {
  domain: string;
  createdAfter?: number;
  projectId: string;
  isCompleted: boolean;
  numPlans?: number;
  logger: SyncLogger;
};

const fetchPlanIds: (props: FetchProps) => Promise<string[]> = async ({
  domain,
  createdAfter,
  projectId,
  isCompleted,
  numPlans,
  logger,
}) => {
  let eventKey = `syncPlans${isCompleted ? 'Completed' : ''}_${projectId}`;

  const args = { domain, projectId };

  if (createdAfter && !isCompleted) args['createdAfter'] = createdAfter;
  if (isCompleted) {
    args['isCompleted'] = 1;
    args['limit'] = numPlans
      ? Math.min(MAX_COMPLETED_PLANS, numPlans)
      : MAX_COMPLETED_PLANS;
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
  props: SyncProps
) => Promise<SyncResult | null> = async ({
  domain,
  result,
  lastPlanSync,
  logger,
  prompter,
}) => {
  const shouldFetch = await prompter(
    'Do you want to load test plans (and their runs) from TestRail?',
    {
      placeholder: 'Y/N',
    }
  );

  if (shouldFetch.toLowerCase() !== 'y') {
    logger('Skipping test plan loading');
    return null;
  }

  logger('Beginning load of open test plans from TestRail');

  const openPlans = [];
  const now = Date.now();

  const projectIds = result.projects.map(project => project.id);

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

  return { ...result, planIds: openPlans };
};

// This stage is primarily useful for first sync to get historical data,
// or as a backup if a plan managed to open and close between syncs of open plans.
export const syncCompletedPlans: (
  props: SyncProps
) => Promise<SyncResult | null> = async ({
  domain,
  result,
  logger,
  prompter,
}) => {
  const shouldFetch = await prompter(
    'Do you want to load completed test plans (and their runs) from TestRail?',
    {
      placeholder: 'Y/N',
    }
  );

  if (shouldFetch.toLowerCase() !== 'y') {
    logger('Skipping completed test plan loading');
    return result;
  }

  const limit = Number.parseInt(
    await prompter(
      'How many completed test plans would you like to load per project? (max 250)',
      {
        default: '250',
      }
    )
  );

  logger('Beginning load of completed test plans from TestRail');

  const completedRuns = [];
  const projectIds = result.projects.map(project => project.id);

  for (const projectId of projectIds) {
    const results = await fetchPlanIds({
      domain,
      projectId,
      isCompleted: true,
      numPlans: limit,
      logger,
    });

    completedRuns.push(...results);
  }

  logger('Successfully fetched all completed test plans');

  return { ...result, planIds: [...result.planIds, ...completedRuns] };
};

export const syncRunsForPlan: (
  props: SyncProps
) => Promise<SyncResult | null> = async ({ domain, result, logger }) => {
  const { planIds } = result;

  if (!planIds || planIds.length === 0) return null;

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

  return { ...result, runs: [...result.runs, ...runs] };
};
