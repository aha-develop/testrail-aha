import { IDENTIFIER, Suite } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

type SyncProps = BaseSyncProps & {
  projectIds: string[];
};

const syncSuites: (props: SyncProps) => Promise<Suite[]> = async ({
  domain,
  logger,
  projectIds,
}) => {
  if (!projectIds?.length) {
    throw new Error('No synced projects found, aborting suite sync.');
  }

  logger('Beginning load of suites from TestRail');

  const now = Date.now();
  const eventKey = `syncSuites-${now}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncSuites`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(
      `Fetching suites, pages ${firstPage} to ${lastPage} of ${projectIds.length}...`
    );
  };

  const suites = await waitForPagedLambda<Suite>({
    lambdaFunc,
    progressFunc,
    args: { domain },
    eventKey,
    usePage: false,
    isPaginated: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  logger('Successfully fetched all suites');

  logger('Saving suites to Aha!');
  await saveRecords<Suite>(suites);
  await aha.account.setExtensionField(IDENTIFIER, 'lastSuiteSync', now);
  logger('Successfully saved all suites');

  return suites;
};

export default syncSuites;
