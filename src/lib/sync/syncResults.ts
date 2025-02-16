import { IDENTIFIER, TestResult } from '../../extension';
import { waitForPagedLambda } from './interface';
import { SyncProps } from './bulkSync';
import { linkResultsToTests } from '../extensionFields/updates';

const syncResults: (props: SyncProps) => Promise<null> = async ({
  domain,
  lastResultSync,
  result,
  logger,
}) => {
  const testResults: TestResult[] = [];
  const runIds = result.runs.map(run => run.id);

  if (!runIds || runIds.length === 0) {
    return null; // No runs to sync results for
  }

  logger('Beginning load of test results from TestRail');

  const now = Date.now();

  for (const runId of runIds) {
    const eventKey = `wizardResults_${runId}`;
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

  return null;
};

export default syncResults;
