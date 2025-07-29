import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, TestCase } from '../../extension';

type SyncProps = BaseSyncProps & {
  lastCaseSync: number;
  projectSuites: {
    [projectId: string]: number[];
  };
  ignoredSuiteIds: number[];
};

const syncCases: (props: SyncProps) => Promise<TestCase[]> = async ({
  domain,
  lastCaseSync,
  projectSuites,
  ignoredSuiteIds,
}) => {
  if (Object.keys(projectSuites).length === 0) {
    return []; // Possible if syncing out of order or all suites are ignored
  }

  const now = Date.now();

  let eventKey = `syncCases-${now}`;
  const args = { domain };

  const lambdaArgs = [];

  for (const projectId in projectSuites) {
    if (projectSuites[projectId].length === 0) {
      lambdaArgs.push({ projectId });
      continue;
    }

    for (const suiteId of projectSuites[projectId]) {
      if (ignoredSuiteIds.includes(suiteId)) continue;

      lambdaArgs.push({ projectId, suiteId });
    }
  }

  if (lastCaseSync) args['updatedAfter'] = Math.floor(lastCaseSync / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncCases`, args);
  };

  const argFunc = (index: number) => lambdaArgs[index];

  const testCases = await waitForIndexedLambda<TestCase>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: lambdaArgs.length,
  });

  await saveRecords<TestCase>(testCases);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCaseSync', now);

  return testCases;
};

export default syncCases;
