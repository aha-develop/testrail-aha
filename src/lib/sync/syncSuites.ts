import { IDENTIFIER, Suite } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
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

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncSuites`, args);
  };

  const suites = await waitForPagedLambda<Suite>({
    lambdaFunc,
    args: { domain },
    eventKey,
    usePage: false,
    isPaginated: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  await saveRecords<Suite>(suites);
  await aha.account.setExtensionField(IDENTIFIER, 'lastSuiteSync', now);

  return suites;
};

export default syncSuites;
