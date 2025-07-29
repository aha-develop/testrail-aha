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
  ignoredSuiteIds: number[];
};

export const syncOpenRuns: (props: SyncProps) => Promise<TestRun[]> = async ({
  domain,
  projectIds,
  ignoredSuiteIds,
}) => {
  if (!projectIds?.length) {
    return [];
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

  const runsToSave = openRuns.filter(
    run => !ignoredSuiteIds.includes(run.suiteId)
  );

  await saveRecords<TestRun>(runsToSave);
  await aha.account.setExtensionField(IDENTIFIER, 'lastRunSync', now);

  return runsToSave;
};

export const syncCompletedRuns: (
  props: SyncProps
) => Promise<TestRun[]> = async ({ domain, projectIds, ignoredSuiteIds }) => {
  if (!projectIds?.length) {
    return [];
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

  const runsToSave = completedRuns.filter(
    run => !ignoredSuiteIds.includes(run.suiteId)
  );

  const newRuns = await saveNewRuns(runsToSave);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCompletedRunSync', now);

  return newRuns;
};
