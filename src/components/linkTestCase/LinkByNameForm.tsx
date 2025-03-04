import React, { useEffect, useState } from 'react';
import SearchByName, { TreeNode } from '../SearchByName';
import SyncProgress from '../SyncProgress';
import { IDENTIFIER, Project, TestCase } from '../../extension';
import {
  getRecords,
  getProjectTestCases,
} from '../../lib/extensionFields/queries';
import { linkRecord } from '../../lib/extensionFields/updates';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';

type Props = {
  record: ExtensionRecord;
  syncData: BulkSyncState;
};

const caseOptions: (
  projects: Project[],
  caseMapping: {
    [projectId: string]: TestCase[];
  }
) => TreeNode[] = (projects, caseMapping) => {
  const options: TreeNode[] = [];

  for (const project of projects) {
    const cases = caseMapping[project.id] || [];

    if (cases.length === 0) continue;

    const header: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      children: cases.map(c => ({
        text: c.title,
        value: `${c.id}`,
        date: c.createdOn * 1000,
      })),
    };

    options.push(header);
  }

  return options;
};

const LinkByNameForm: React.FC<Props> = ({ syncData, record }) => {
  const [loading, setLoading] = useState(true);

  const [linkedCaseIds, setLinkedCaseIds] = useState<string[]>([]);
  const [caseTree, setCaseTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    const fetchCases = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [caseMapping, projects] = await Promise.all([
        getProjectTestCases(projectIds),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      const caseIds = await record.getExtensionField<number[]>(
        IDENTIFIER,
        'caseIds'
      );
      setLinkedCaseIds(caseIds.map(id => id.toString()) || []);

      setCaseTree(caseOptions(projects, caseMapping));
      setLoading(false);
    };

    fetchCases();
  }, []);

  const linkCaseFunction: (caseId: string) => Promise<void> = async caseId => {
    await linkRecord(record, Number.parseInt(caseId), 'caseIds');
    setLinkedCaseIds([...linkedCaseIds, caseId]);
  };

  return (
    <div className='search-form'>
      {!syncData?.lastSync && (
        <aha-alert type='warning' dismissable>
          <div slot='heading'>We haven't fully synced with TestRail yet.</div>
          We're still gathering data from the TestRail API, so search results
          will be incomplete. Please remain on the tests tab until it has
          finished.
        </aha-alert>
      )}
      <SearchByName
        tree={caseTree}
        selected={linkedCaseIds}
        onSelect={linkCaseFunction}
        recordName='test case'
        referencePrefix='C'
        loading={loading}
      >
        <SyncProgress syncData={syncData} />
      </SearchByName>
    </div>
  );
};

export default LinkByNameForm;
