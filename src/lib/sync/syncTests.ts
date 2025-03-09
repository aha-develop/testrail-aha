import { IDENTIFIER, Test } from '../../extension';
import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  runIds: number[];
};

const syncTests: (props: SyncProps) => Promise<Test[]> = async ({
  domain,
  runIds,
  logger,
}) => {
  if (!runIds?.length) {
    logger('No synced test runs found, aborting test result sync.');
    return [];
  }

  logger('Beginning load of tests from TestRail');

  const now = Date.now();

  const eventKey = `syncTests-${now}`;
  const args = { domain };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncTests`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching tests, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => ({ runId: runIds[index] });

  const tests = await waitForIndexedLambda<Test>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: runIds.length,
  });

  logger('Successfully fetched all tests');

  logger('Saving tests to Aha!');
  await saveRecords<Test>(tests);
  await aha.account.setExtensionField(IDENTIFIER, 'lastTestSync', now);
  logger('Successfully saved all tests');

  return tests;
};

export default syncTests;
