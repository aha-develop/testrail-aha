import { IDENTIFIER, Test } from '../../extension';
import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  runIds: number[];
};

const syncTests: (props: SyncProps) => Promise<Test[]> = async ({
  domain,
  runIds,
}) => {
  if (!runIds?.length) {
    return [];
  }

  const now = Date.now();

  const eventKey = `syncTests-${now}`;
  const args = { domain };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncTests`, args);
  };

  const argFunc = (index: number) => ({ runId: runIds[index] });

  const tests = await waitForIndexedLambda<Test>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: runIds.length,
  });

  await saveRecords<Test>(tests);
  await aha.account.setExtensionField(IDENTIFIER, 'lastTestSync', now);

  return tests;
};

export default syncTests;
