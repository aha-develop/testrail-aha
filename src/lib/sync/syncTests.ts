import { IDENTIFIER, Test } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  lastTestSync?: number;
  runIds: string[];
};

const syncTests: (props: SyncProps) => Promise<Test[]> = async ({
  domain,
  lastTestSync,
  runIds,
  logger,
}) => {
  const tests: Test[] = [];

  if (!runIds?.length) {
    throw new Error('No synced test runs found, aborting test sync.');
  }

  logger('Beginning load of tests from TestRail');

  const now = Date.now();

  for (const runId of runIds) {
    const eventKey = `syncTests_${runId}-${now}`;
    const args = { domain, runId };

    if (lastTestSync) args['updatedAfter'] = Math.floor(lastTestSync / 1000);

    const lambdaFunc = async args => {
      await aha.triggerServer(`${IDENTIFIER}.syncTests`, args);
    };

    const progressFunc = async (firstPage, lastPage) => {
      logger(
        `Fetching tests for run ${runId}, pages ${firstPage} to ${lastPage}...`
      );
    };

    const results = await waitForPagedLambda<Test>({
      lambdaFunc,
      progressFunc,
      args,
      eventKey,
    });

    tests.push(...results);
  }

  logger('Successfully fetched all tests');

  logger('Saving tests to Aha!');
  await saveRecords<Test>(tests);
  await aha.account.setExtensionField(IDENTIFIER, 'lastTestSync', now);
  logger('Successfully saved all tests');

  return tests;
};

export default syncTests;
