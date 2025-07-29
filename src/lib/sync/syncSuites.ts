import { IDENTIFIER, Suite } from '../../extension';
import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  projectIds: number[];
  ignoredSuiteIds: number[];
};

const syncSuites: (props: SyncProps) => Promise<Suite[]> = async ({
  domain,
  projectIds,
  ignoredSuiteIds,
}) => {
  if (!projectIds?.length) {
    return [];
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

  const visibleSuites = suites.filter(
    suite => !ignoredSuiteIds.includes(suite.id)
  );

  await saveRecords<Suite>(visibleSuites);

  await aha.account.setExtensionField(IDENTIFIER, 'lastSuiteSync', now);

  return visibleSuites;
};

export default syncSuites;
