import { IDENTIFIER, Test } from '../../extension';
import { waitForPagedLambda } from './interface';
import { SyncProps } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

const syncTests: (props: SyncProps) => Promise<null> = async ({
  domain,
  lastTestSync,
  result,
  logger,
}) => {
  const tests: Test[] = [];
  const runIds = result.runs?.map(run => run.id);

  if (!runIds || runIds.length === 0) {
    return null; // No runs to sync tests for
  }

  logger('Beginning load of tests from TestRail');

  const now = Date.now();

  for (const runId of runIds) {
    const eventKey = `syncTests_${runId}`;
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

  // No need to return tests as they aren't used by any other syncing steps
  return null;
};

export default syncTests;
