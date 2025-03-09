import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, Section } from '../../extension';

type SyncProps = BaseSyncProps & {
  projectSuites: {
    [projectId: string]: number[];
  };
};

const syncSections: (props: SyncProps) => Promise<Section[]> = async ({
  domain,
  projectSuites,
  logger,
}) => {
  if (Object.keys(projectSuites).length === 0) {
    throw new Error('No synced projects found, aborting section sync.');
  }

  logger('Beginning load of sections from TestRail');

  const now = Date.now();

  let eventKey = `syncSections-${Date.now()}`;
  const args = { domain };

  const lambdaArgs = [];

  for (const projectId in projectSuites) {
    if (projectSuites[projectId].length === 0) {
      lambdaArgs.push({ projectId });
      continue;
    }

    for (const suiteId of projectSuites[projectId]) {
      lambdaArgs.push({ projectId, suiteId });
    }
  }

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncSections`, args);
  };

  const progressFunc = async (firstPage, lastPage) => {
    logger(`Fetching sections, pages ${firstPage} to ${lastPage}...`);
  };

  const argFunc = (index: number) => lambdaArgs[index];
  const sections = await waitForIndexedLambda<Section>({
    lambdaFunc,
    progressFunc,
    args,
    eventKey,
    argFunc,
    numIds: lambdaArgs.length,
  });

  logger('Successfully fetched all sections');

  logger('Saving sections to Aha!');
  await saveRecords<Section>(sections);
  await aha.account.setExtensionField(IDENTIFIER, 'lastSectionSync', now);
  logger('Successfully saved all sections');

  return sections;
};

export default syncSections;
