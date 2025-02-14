import { IDENTIFIER, Suite } from '../../extension';
import { waitForPagedLambda } from './interface';
import { SyncProps, SyncResult } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

const syncSuites: (props: SyncProps) => Promise<SyncResult> = async ({
  domain,
  result,
  logger,
}) => {
  logger('Beginning load of suites from TestRail');

  const projectIds = result.projects.map(project => project.id);

  const eventKey = 'syncSuites';
  const args = { domain };
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
    args,
    eventKey,
    usePage: false,
    idKey: 'projectId',
    ids: projectIds,
  });

  logger('Successfully fetched all suites');

  logger('Saving suites to Aha!');
  await saveRecords<Suite>(suites);
  logger('Successfully saved all suites');

  return { ...result, suites };
};

export default syncSuites;
