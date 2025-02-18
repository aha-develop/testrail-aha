import { IDENTIFIER, TestResult } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
import { linkResultsToTests } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  lastResultSync?: number;
  runIds: string[];
};

const syncResults: (props: SyncProps) => Promise<TestResult[]> = async ({
  domain,
  lastResultSync,
  runIds,
  logger,
}) => {
  if (!runIds?.length) {
    throw new Error('No synced test runs found, aborting test result sync.');
  }

  const testResults: TestResult[] = [];

  logger('Beginning load of test results from TestRail');

  const now = Date.now();

  for (const runId of runIds) {
    const eventKey = `wizardResults_${runId}-${now}`;
    const args = { domain, runId };

    if (lastResultSync)
      args['createdAfter'] = Math.floor(lastResultSync / 1000);

    const lambdaFunc = async args => {
      await aha.triggerServer(`${IDENTIFIER}.syncResults`, args);
    };

    const progressFunc = async (firstPage, lastPage) => {
      logger(
        `Fetching test results for run ${runId}, pages ${firstPage} to ${lastPage}...`
      );
    };

    const results = await waitForPagedLambda<TestResult>({
      lambdaFunc,
      progressFunc,
      args,
      eventKey,
    });

    testResults.push(...results);
  }

  logger('Successfully fetched all test results');

  logger('Linking test results to tests');
  await linkResultsToTests(testResults);
  await aha.account.setExtensionField(IDENTIFIER, 'lastResultSync', now);
  logger('Successfully linked test results');

  return testResults;
};

export default syncResults;
