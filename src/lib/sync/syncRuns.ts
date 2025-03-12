import { IDENTIFIER, TestRun } from '../../extension';
import {
  BaseSyncProps,
  waitForPagedLambda,
  waitForIndexedLambda,
} from './interface';
import { saveRecords, saveNewRuns } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed runs per project, to avoid loading up on historic data.
const NUM_COMPLETED_RUNS = 250;

type SyncProps = BaseSyncProps & {
  projectIds: number[];
};

export const syncOpenRuns: (props: SyncProps) => Promise<TestRun[]> = async ({
  domain,
  projectIds,
}) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, aborting open test run sync.');
  }

  const now = Date.now();

  let eventKey = `syncRuns-${Date.now()}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRuns`, args);
  };

  const argFunc = (index: number) => ({ projectId: projectIds[index] });

  const openRuns = await waitForIndexedLambda<TestRun>({
    lambdaFunc,
    args: { domain, isCompleted: 0 },
    eventKey,
    argFunc,
    numIds: projectIds.length,
  });

  await saveRecords<TestRun>(openRuns);
  await aha.account.setExtensionField(IDENTIFIER, 'lastRunSync', now);

  return openRuns;
};

export const syncCompletedRuns: (
  props: SyncProps
) => Promise<TestRun[]> = async ({ domain, projectIds }) => {
  if (!projectIds?.length) {
    throw new Error(
      'No synced projects found, aborting completed test run sync.'
    );
  }

  const now = Date.now();
  let eventKey = `syncCompletedRuns-${Date.now()}`;
  const args = { domain, isCompleted: 1, limit: NUM_COMPLETED_RUNS };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncRuns`, args);
  };

  const completedRuns = await waitForPagedLambda<TestRun>({
    lambdaFunc,
    args,
    eventKey,
    usePage: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  const newRuns = await saveNewRuns(completedRuns);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedRunSync', now);

  return newRuns;
};
