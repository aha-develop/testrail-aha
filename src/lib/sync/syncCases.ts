import { waitForPagedLambda } from './interface';
import { SyncLogger, SyncProps, SyncResult } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, Project, Suite, TestCase } from '../../extension';

type FetchProps = {
  domain: string;
  updatedAfter?: number;
  projectId: string;
  suiteId?: string;
  logger: SyncLogger;
};

type MapProps = {
  projects: Project[];
  suites: Suite[];
};

const mapProjectSuites: (props: MapProps) => {
  [projectId: string]: string[];
} = ({ projects, suites }) => {
  const projectSuites = {};

  for (const suite of suites) {
    if (!projectSuites[suite.projectId]) {
      projectSuites[suite.projectId] = [];
    }

    projectSuites[suite.projectId].push(suite.id);
  }

  for (const project of projects) {
    if (!projectSuites[project.id]) {
      projectSuites[project.id] = [];
    }
  }

  return projectSuites;
};

const fetchCases: (props: FetchProps) => Promise<TestCase[]> = async ({
  domain,
  updatedAfter,
  projectId,
  suiteId,
  logger,
}) => {
  let eventKey = `syncCases_${projectId}`;
  if (suiteId) eventKey += `_${suiteId}`;

  const args = { domain, projectId };

  if (suiteId) args['suiteId'] = suiteId;
  if (updatedAfter) args['updatedAfter'] = updatedAfter;

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

const syncCases: (props: SyncProps) => Promise<SyncResult> = async ({
  domain,
  lastCaseSync,
  result,
  logger,
}) => {
  logger('Beginning load of test cases from TestRail');

  const { projects, suites } = result;

  const testCases = [];
  const projectSuites = mapProjectSuites({
    projects: projects ?? [],
    suites: suites ?? [],
  });

  const now = Date.now();

  for (const projectId in projectSuites) {
    if (projectSuites[projectId].length === 0) {
      const results = await fetchCases({
        domain,
        updatedAfter: lastCaseSync,
        projectId,
        logger,
      });

      testCases.concat(results);
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

      testCases.concat(results);
    }
  }

  logger('Successfully fetched all test cases');

  logger('Saving test cases to Aha!');
  await saveRecords<TestCase>(testCases);
  await aha.account.setExtensionField(IDENTIFIER, 'lastCaseSync', now);
  logger('Successfully saved all test cases');

  return { ...result, testCases };
};

export default syncCases;
