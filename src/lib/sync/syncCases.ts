import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, TestCase } from '../../extension';

type SyncProps = BaseSyncProps & {
  lastCaseSync: number;
  projectSuites: {
    [projectId: string]: string[];
  };
};

const syncCases: (props: SyncProps) => Promise<TestCase[]> = async ({
  domain,
  lastCaseSync,
  projectSuites,
  logger,
}) => {
  if (Object.keys(projectSuites).length === 0) {
    throw new Error('No synced projects found, aborting test case sync.');
  }

  logger('Beginning load of test cases from TestRail');

  const now = Date.now();

  let eventKey = `syncCases-${Date.now()}`;
  const args = { domain };

  const lambdaArgs = [];

  for (const projectId in projectSuites) {
    if (projectSuites[projectId].length === 0) {
      lambdaArgs.push({ projectId });
      continue;
    }

    for (const suiteId of projectSuites[projectId]) {
      lambdaArgs.push({ projectId, suiteId });
    }
  }

  if (lastCaseSync) args['updatedAfter'] = Math.floor(lastCaseSync / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncCases`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching test cases, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => lambdaArgs[index];

  const testCases = await waitForIndexedLambda<TestCase>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: lambdaArgs.length,
  });

  logger('Successfully fetched all test cases');

  logger('Saving test cases to Aha!');
  await saveRecords<TestCase>(testCases);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCaseSync', now);
  logger('Successfully saved all test cases');

  return testCases;
};

export default syncCases;
