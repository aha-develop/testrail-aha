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
}) => {
  if (!runIds?.length) {
    return [];
  }

  const now = Date.now();
  let eventKey = `syncRuns-${Date.now()}`;
  const args = { domain };

  if (lastResultSync) args['createdAfter'] = Math.floor(lastResultSync / 1000);

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncResults`, args);
  };

  const argFunc = (index: number) => ({ runId: runIds[index] });

  const testResults = await waitForIndexedLambda<TestResult>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: runIds.length,
  });

  await linkResultsToTests(testResults);
  await aha.account.setExtensionField(IDENTIFIER, 'lastResultSync', now);

  return testResults;
};

export default syncResults;
