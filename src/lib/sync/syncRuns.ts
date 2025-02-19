import { IDENTIFIER, TestRun } from '../../extension';
import { PagedAPIResult } from '../api';
import { BaseSyncProps, waitForLambda, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed runs per project, to avoid loading up on historic data.
const NUM_COMPLETED_RUNS = 250;

type FetchProps = {
  domain: string;
  createdAfter?: number;
  projectId: string;
  isCompleted: boolean;
  numRuns?: number;
  logger: (message: string) => void;
};

type SyncProps = BaseSyncProps & {
  projectIds: string[];
  lastRunSync?: number;
};

const fetchRuns: (props: FetchProps) => Promise<TestRun[]> = async ({
  domain,
  createdAfter,
  projectId,
  isCompleted,
  logger,
}) => {
  let eventKey = `syncRuns${
    isCompleted ? 'Completed' : ''
  }_${projectId}-${Date.now()}`;

  const args = { domain, projectId };

  if (createdAfter && !isCompleted)
    args['createdAfter'] = Math.floor(createdAfter / 1000);
  if (isCompleted) {
    args['isCompleted'] = 1;
    args['limit'] = NUM_COMPLETED_RUNS;
  } else {
    args['isCompleted'] = 0;
  }

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRuns`, args);
  };

  if (isCompleted) {
    logger(`Fetching completed test runs for project ${projectId}...`);

    const apiResult = await waitForLambda<PagedAPIResult>({
      lambdaFunc,
      args,
      eventKey,
    });

    if (apiResult.error) {
      throw new Error(apiResult.message);
    } else {
      return apiResult.result.result as TestRun[];
    }
  } else {
    const progressFunc = async (firstPage, lastPage) => {
      logger(
        `Fetching open test runs, pages ${firstPage} to ${lastPage} for project ${projectId}...`
      );
    };

    return await waitForPagedLambda<TestRun>({
      lambdaFunc,
      progressFunc,
      args,
      eventKey,
    });
  }
};

export const syncOpenRuns: (props: SyncProps) => Promise<TestRun[]> = async ({
  domain,
  projectIds,
  lastRunSync,
  logger,
}) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, aborting open test run sync.');
  }

  logger('Beginning load of open test runs from TestRail');

  const openRuns = [];
  const now = Date.now();

  for (const projectId of projectIds) {
    const results = await fetchRuns({
      domain,
      projectId,
      logger,
      isCompleted: false,
      createdAfter: lastRunSync,
    });

    openRuns.push(...results);
  }

  logger('Successfully fetched all open test runs');

  logger('Saving open test runs to Aha!');
  await saveRecords<TestRun>(openRuns);
  await aha.account.setExtensionField(IDENTIFIER, 'lastRunSync', now);
  logger('Successfully saved all open test runs');

  return openRuns;
};

export const syncCompletedRuns: (
  props: SyncProps
) => Promise<TestRun[]> = async ({ domain, projectIds, logger }) => {
  if (!projectIds?.length) {
    throw new Error(
      'No synced projects found, aborting completed test run sync.'
    );
  }

  logger('Beginning load of completed test runs from TestRail');

  const completedRuns = [];
  const now = Date.now();

  for (const projectId of projectIds) {
    const results = await fetchRuns({
      domain,
      projectId,
      isCompleted: true,
      logger,
    });

    completedRuns.push(...results);
  }

  logger('Successfully fetched all completed test runs');

  logger('Saving completed test runs to Aha!');
  await saveRecords<TestRun>(completedRuns);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedRunSync', now);
  logger('Successfully saved all completed test runs');

  return completedRuns;
};
