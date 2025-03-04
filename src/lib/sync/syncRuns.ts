import { IDENTIFIER, TestRun } from '../../extension';
import {
  BaseSyncProps,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';
import { saveRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed runs per project, to avoid loading up on historic data.
const NUM_COMPLETED_RUNS = 250;

type SyncProps = BaseSyncProps & {
  projectIds: string[];
  lastRunSync?: number;
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

  const now = Date.now();

  let eventKey = `syncRuns-${Date.now()}`;

  const args = { domain, isCompleted: 0 };

  if (lastRunSync) args['createdAfter'] = Math.floor(lastRunSync / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRuns`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching open test runs, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => ({ projectId: projectIds[index] });

  const openRuns = await waitForIndexedLambda<TestRun>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: projectIds.length,
  });

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

  const now = Date.now();

  let eventKey = `syncCompletedRuns-${Date.now()}`;

  const args = { domain, isCompleted: 1, limit: NUM_COMPLETED_RUNS };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRuns`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching completed test runs, pages ${firstPage} to ${lastPage}...`
    );
  };

  const completedRuns = await waitForPagedLambda<TestRun>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    usePage: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  logger('Successfully fetched all completed test runs');

  logger('Saving completed test runs to Aha!');
  await saveRecords<TestRun>(completedRuns);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedRunSync', now);
  logger('Successfully saved all completed test runs');

  return completedRuns;
};
