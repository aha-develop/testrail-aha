import React, { useEffect, useState } from 'react';
import SearchByName, { TreeHeader } from './SearchByName';
import SyncProgress from './SyncProgress';
import { IDENTIFIER, Project, TestCase } from '../../extension';
import {
  getProjects,
  getProjectTestCases,
} from '../../lib/extensionFields/queries';
import { linkTestCase } from '../../lib/extensionFields/updates';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState, SyncState } from '../../lib/sync/bulkSync';

type Props = {
  record: ExtensionRecord;
  syncData: BulkSyncState;
};

const caseOptions: (
  projects: Project[],
  caseMapping: {
    [projectId: string]: TestCase[];
  }
) => TreeHeader[] = (projects, caseMapping) => {
  const options: TreeHeader[] = [];

  for (const project of projects) {
    const cases = caseMapping[project.id] || [];

    if (cases.length === 0) continue;

    const header: TreeHeader = {
      value: project.id,
      text: project.name,
      children: cases.map(c => ({
        text: c.title,
        value: `${c.id}`,
      })),
    };

    options.push(header);
  }

  return options;
};

const LinkByNameForm: React.FC<Props> = ({ syncData, record }) => {
  const [loading, setLoading] = useState(true);

  const firstSync = !syncData?.lastSync;
  const syncing = syncData?.state !== SyncState.Complete;

  const [linkedCaseIds, setLinkedCaseIds] = useState<string[]>([]);
  const [caseTree, setCaseTree] = useState<TreeHeader[]>([]);

  useEffect(() => {
    const fetchCases = async () => {
      const projectIds = await aha.account.getExtensionField<string[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [caseMapping, projects] = await Promise.all([
        getProjectTestCases(projectIds),
        getProjects(projectIds),
      ]);

      const caseIds = await record.getExtensionField(IDENTIFIER, 'caseIds');
      setLinkedCaseIds(caseIds || []);

      setCaseTree(caseOptions(projects, caseMapping));
      setLoading(false);
    };

    fetchCases();
  }, []);

  const linkCaseFunction: (caseId: string) => Promise<void> = async caseId =>
    await linkTestCase(record, caseId);

  return (
    <div className='search-form'>
      {syncing && (
        <>
          {firstSync && (
            <aha-alert type='warning' dismissable>
              <div slot='heading'>
                We haven't fully synced with TestRail yet.
              </div>
              We're still gathering data from the TestRail API, so search
              results will be incomplete. Please remain on the tests tab until
              it has finished.
            </aha-alert>
          )}
        </>
      )}
      {loading && (
        <div className='form-loading'>
          <span>Fetching saved test cases...</span>
          <aha-spinner />
        </div>
      )}

      <SearchByName
        tree={caseTree}
        selected={linkedCaseIds}
        setSelected={setLinkedCaseIds}
        onSelect={linkCaseFunction}
        recordName='test case'
      >
        <SyncProgress syncData={syncData} />
      </SearchByName>
    </div>
  );
};

export default LinkByNameForm;
