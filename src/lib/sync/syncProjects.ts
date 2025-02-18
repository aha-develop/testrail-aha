import { IDENTIFIER, Project } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

const syncProjects: (props: BaseSyncProps) => Promise<Project[]> = async ({
  domain,
  logger,
}) => {
  logger('Beginning load of projects from TestRail');

  const now = Date.now();
  const eventKey = `syncProjects-${now}`;
  const args = { domain };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncProjects`, args);
  };
  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching projects, pages ${firstPage} to ${lastPage}...`);
  };

  const results = await waitForPagedLambda<Project>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
  });

  logger('Successfully fetched all projects');

  logger('Saving projects to Aha!');
  await saveRecords<Project>(results);
  await aha.account.setExtensionField(IDENTIFIER, 'lastProjectSync', now);
  logger('Successfully saved all projects');

  return results;
};

export default syncProjects;
