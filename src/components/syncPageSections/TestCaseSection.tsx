import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncCases from '../../lib/sync/syncCases';
import {
  indexKeyForKindAndParent,
  getAccountExtensionFieldMap,
} from '../../lib/extensionFields/queries';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  lastSync,
  setLoading,
  setSyncing,
  setLastSync,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);
    setMessage('Fetching parent projects and suites for cases...');

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

    await syncCases({
      domain,
      logger: setMessage,
      projectSuites,
      lastCaseSync: lastSync,
    });
    await setLastSync(now);
  } catch (error) {
    setMessage(null);
    setError(error.message);
  } finally {
    setLoading(false);
    setSyncing(false);
  }
};

const TestCaseSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync test cases'
      resync={resync}
      domain={domain}
      disabled={disabled}
      hasToggle={true}
      setDisabled={setDisabled}
      syncKey={'lastCaseSync'}
    />
  );
};

export default TestCaseSection;
