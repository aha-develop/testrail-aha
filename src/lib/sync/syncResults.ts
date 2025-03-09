import { IDENTIFIER, TestResult } from '../../extension';
import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { linkResultsToTests } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  lastResultSync?: number;
  runIds: number[];
};

const syncResults: (props: SyncProps) => Promise<TestResult[]> = async ({
  domain,
  lastResultSync,
  runIds,
  logger,
}) => {
  if (!runIds?.length) {
    logger('No synced test runs found, aborting test result sync.');
    return [];
  }

  logger('Beginning load of test results from TestRail');

  const now = Date.now();

  let eventKey = `syncRuns-${Date.now()}`;

  const args = { domain };

  if (lastResultSync) args['createdAfter'] = Math.floor(lastResultSync / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncResults`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching test results, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => ({ runId: runIds[index] });

  const testResults = await waitForIndexedLambda<TestResult>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: runIds.length,
  });

  logger('Successfully fetched all test results');

  logger('Linking test results to tests');
  await linkResultsToTests(testResults);
  await aha.account.setExtensionField(IDENTIFIER, 'lastResultSync', now);
  logger('Successfully linked test results');

  return testResults;
};

export default syncResults;
