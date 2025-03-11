import { IDENTIFIER, Project } from '../../extension';
import { BaseSyncProps, waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

const syncProjects: (props: BaseSyncProps) => Promise<Project[]> = async ({
  domain,
}) => {
  const now = Date.now();
  const eventKey = `syncProjects-${now}`;
  const args = { domain };

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncProjects`, args);
  };

  const results = await waitForPagedLambda<Project>({
    lambdaFunc,
    args,
    eventKey,
  });

  await saveRecords<Project>(results);
  await aha.account.setExtensionField(IDENTIFIER, 'lastProjectSync', now);

  return results;
};

export default syncProjects;
