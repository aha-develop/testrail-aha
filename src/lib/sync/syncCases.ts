import { BaseSyncProps, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, TestCase } from '../../extension';

type FetchProps = {
  domain: string;
  updatedAfter?: number;
  projectId: string;
  suiteId?: string;
  logger: (message: string) => void;
};

type SyncProps = BaseSyncProps & {
  lastCaseSync: number;
  projectSuites: {
    [projectId: string]: string[];
  };
};

const fetchCases: (props: FetchProps) => Promise<TestCase[]> = async ({
  domain,
  updatedAfter,
  projectId,
  suiteId,
  logger,
}) => {
  let eventKey = `syncCases_${projectId}-${Date.now()}`;
  if (suiteId) eventKey += `_${suiteId}`;

  const args = { domain, projectId };

  if (suiteId) args['suiteId'] = suiteId;
  if (updatedAfter) args['updatedAfter'] = Math.floor(updatedAfter / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncCases`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching test cases, pages ${firstPage} to ${lastPage} for project ${projectId}${
        suiteId ? ` and suite ${suiteId}...` : '...'
      }`
    );
  };

  return await waitForPagedLambda<TestCase>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
  });
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

  const testCases: TestCase[] = [];
  const now = Date.now();

  for (const projectId in projectSuites) {
    if (projectSuites[projectId].length === 0) {
      const results = await fetchCases({
        domain,
        updatedAfter: lastCaseSync,
        projectId,
        logger,
      });

      testCases.push(...results);
      continue;
    }

    for (const suiteId of projectSuites[projectId]) {
      const results = await fetchCases({
        domain,
        updatedAfter: lastCaseSync,
        projectId,
        suiteId,
        logger,
      });

      testCases.push(...results);
    }
  }

  logger('Successfully fetched all test cases');

  logger('Saving test cases to Aha!');
  await saveRecords<TestCase>(testCases);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCaseSync', now);
  logger('Successfully saved all test cases');

  return testCases;
};

export default syncCases;
