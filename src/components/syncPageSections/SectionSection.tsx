import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncSections from '../../lib/sync/syncSections';
import {
  indexKeyForKindAndParent,
  getAccountExtensionFieldMap,
} from '../../lib/extensionFields/queries';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setLoading,
  setSyncing,
  setLastSync,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);
    setMessage('Fetching parent projects and suites for sections...');

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const keys = projectIds.map(projectId =>
      indexKeyForKindAndParent('Suite', projectId)
    );

    const projectSuites = {};
    const suiteFields = await getAccountExtensionFieldMap<string[]>(keys);

    for (const key in suiteFields) {
      const projectId = key.split('_')[1];

      if (!projectSuites[projectId]) {
        projectSuites[projectId] = [];
      }

      projectSuites[projectId].push(...suiteFields[key]);
    }

    const now = Date.now();

    await syncSections({
      domain,
      logger: setMessage,
      projectSuites,
    });

    await setLastSync(now);
  } catch (error) {
    setMessage(null);
    setError(error.message);
    throw error;
  } finally {
    setLoading(false);
    setSyncing(false);
  }
};

const SectionSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync sections'
      resync={resync}
      domain={domain}
      disabled={disabled}
      setDisabled={setDisabled}
      syncKey={'lastSectionSync'}
    />
  );
};

export default SectionSection;
