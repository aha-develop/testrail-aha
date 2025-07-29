import { BaseSyncProps, waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import { IDENTIFIER, Section } from '../../extension';

type SyncProps = BaseSyncProps & {
  projectSuites: {
    [projectId: string]: number[];
  };
  ignoredSuiteIds: number[];
};

const syncSections: (props: SyncProps) => Promise<Section[]> = async ({
  domain,
  projectSuites,
  ignoredSuiteIds,
}) => {
  if (Object.keys(projectSuites).length === 0) {
    return [];
  }

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
      if (ignoredSuiteIds.includes(suiteId)) continue;

      lambdaArgs.push({ projectId, suiteId });
    }
  }

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncSections`, args);
  };

  const argFunc = (index: number) => lambdaArgs[index];
  const sections = await waitForIndexedLambda<Section>({
    lambdaFunc,
    args,
    eventKey,
    argFunc,
    numIds: lambdaArgs.length,
  });

  await saveRecords<Section>(sections);
  await aha.account.setExtensionField(IDENTIFIER, 'lastSectionSync', now);

  return sections;
};

export default syncSections;
