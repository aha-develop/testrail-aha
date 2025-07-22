import { IDENTIFIER, Suite } from '../../extension';
import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  projectIds: number[];
};

const syncSuites: (props: SyncProps) => Promise<Suite[]> = async ({
  domain,
  projectIds,
}) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, aborting suite sync.');
  }

  const now = Date.now();
  const eventKey = `syncSuites-${now}`;

  const args = { domain };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncSuites`, args);
  };

  const argFunc = (index: number) => ({ projectId: projectIds[index] });

  const suites = await waitForIndexedLambda<Suite>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: projectIds.length,
  });

  await saveRecords<Suite>(suites);
  await aha.account.setExtensionField(IDENTIFIER, 'lastSuiteSync', now);

  return suites;
};

export default syncSuites;
