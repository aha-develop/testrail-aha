import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncCases from '../../lib/sync/syncCases';
import {
  getProjects,
  getSuiteIdsForProject,
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
      (await aha.account.getExtensionField<string[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const projects = await getProjects(projectIds);
    const projectSuites = {};
    const suitePromises = [];

    for (const project of projects) {
      projectSuites[project.id] = [];

      if (project.suite_mode !== 1) {
        suitePromises.push(
          (async () => {
            const suiteIds = await getSuiteIdsForProject(project);
            projectSuites[project.id] = suiteIds;
          })()
        );
      }
    }

    await Promise.all(suitePromises);

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
