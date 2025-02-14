import { IDENTIFIER, Project } from '../../extension';
import { waitForPagedLambda } from './interface';
import { SyncProps, SyncResult } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

const syncProjects: (props: SyncProps) => Promise<SyncResult> = async ({
  domain,
  result,
  logger,
}) => {
  logger('Beginning load of projects from TestRail');

  const eventKey = 'syncProjects';
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
  logger('Successfully saved all projects');

  return { ...result, projects: results };
};

export default syncProjects;
