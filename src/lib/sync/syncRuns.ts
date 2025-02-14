import { IDENTIFIER, TestRun } from '../../extension';
import { PagedAPIResult } from '../api';
import { waitForLambda, waitForPagedLambda } from './interface';
import { SyncProps, SyncResult, SyncLogger } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

// We don't want to fetch more than a page of completed runs, to avoid loading up on historic data.
const MAX_COMPLETED_RUNS = 250;

type FetchProps = {
  domain: string;
  createdAfter?: number;
  projectId: string;
  isCompleted: boolean;
  numRuns?: number;
  logger: SyncLogger;
};

const fetchRuns: (props: FetchProps) => Promise<TestRun[]> = async ({
  domain,
  createdAfter,
  projectId,
  isCompleted,
  numRuns,
  logger,
}) => {
  let eventKey = `syncRuns${isCompleted ? 'Completed' : ''}_${projectId}`;

  const args = { domain, projectId };

  if (createdAfter && !isCompleted) args['createdAfter'] = createdAfter;
  if (isCompleted) {
    args['isCompleted'] = 1;
    args['limit'] = numRuns
      ? Math.min(MAX_COMPLETED_RUNS, numRuns)
      : MAX_COMPLETED_RUNS;
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

export const syncOpenRuns: (props: SyncProps) => Promise<SyncResult> = async ({
  domain,
  result,
  lastRunSync,
  logger,
}) => {
  logger('Beginning load of open test runs from TestRail');

  const openRuns = [];
  const projectIds = result.projects.map(project => project.id);
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

  return { ...result, runs: openRuns };
};

export const syncCompletedRuns: (
  props: SyncProps
) => Promise<SyncResult | null> = async ({
  domain,
  result,
  logger,
  prompter,
}) => {
  const shouldFetch = await prompter(
    'Do you want to load completed test runs from TestRail?',
    {
      placeholder: 'Y/N',
    }
  );

  if (shouldFetch.toLowerCase() !== 'y') {
    logger('Skipping completed test run loading');
    return null;
  }

  const limit = Number.parseInt(
    await prompter(
      'How many completed test runs would you like to load per project? (max 250)',
      {
        default: '250',
      }
    )
  );

  logger('Beginning load of completed test runs from TestRail');

  const completedRuns = [];
  const projectIds = result.projects.map(project => project.id);

  for (const projectId of projectIds) {
    const results = await fetchRuns({
      domain,
      projectId,
      isCompleted: true,
      numRuns: limit,
      logger,
    });

    completedRuns.push(...results);
  }

  logger('Successfully fetched all completed test runs');

  logger('Saving completed test runs to Aha!');
  await saveRecords<TestRun>(completedRuns);
  logger('Successfully saved all completed test runs');

  return { ...result, runs: [...result.runs, ...completedRuns] };
};
