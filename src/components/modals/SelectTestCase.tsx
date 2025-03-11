import React, { useEffect, useState } from 'react';
import SearchByName, { TreeNode } from './SearchByName';
import SyncProgress from '../SyncProgress';
import { IDENTIFIER, Project, TestCase } from '../../extension';
import {
  getRecords,
  getProjectRecords,
} from '../../lib/extensionFields/queries';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';

type Props = {
  syncData: BulkSyncState;
  caseId: string;
  caseIds: number[];
  setCaseId: (caseId: string) => Promise<void>;
};

const caseOptions: (
  projects: Project[],
  caseMapping: {
    [projectId: string]: TestCase[];
  },
  caseIds: number[]
) => TreeNode[] = (projects, caseMapping, caseIds) => {
  const options: TreeNode[] = [];
  let idMapping: { [caseId: number]: boolean } = [];

  if (caseIds && caseIds.length) {
    idMapping = caseIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
  }

  for (const project of projects) {
    const cases = caseMapping[project.id] || [];

    const filteredCases = cases.filter(c => !idMapping[c.id]);

    if (filteredCases.length === 0) continue;

    const header: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      children: filteredCases.map(c => ({
        text: c.title,
        value: `${c.id}`,
        date: c.createdOn * 1000,
      })),
    };

    options.push(header);
  }

  return options;
};

const SelectTestCase: React.FC<Props> = ({
  syncData,
  caseId,
  caseIds,
  setCaseId,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null); // True if syncing on initial load
  const [syncingCases, setSyncingCases] = useState(false); // True if there may be new cases to sync

  const [caseTree, setCaseTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    const fetchCases = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [caseMapping, projects] = await Promise.all([
        getProjectRecords<TestCase>(projectIds, 'TestCase'),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      setCaseTree(caseOptions(projects, caseMapping, caseIds));
      setLoading(false);
    };

    if (syncData && syncing === null) {
      setSyncing(syncData.state !== SyncState.Complete);
    }

    const lastState = syncingCases;
    let currentState = syncingCases;

    if (syncData) {
      currentState = syncData.stage <= SyncStage.TestCases;
      setSyncingCases(currentState);
    }

    // Fetch data on first load or if new cases potentially synced
    if (loading || (lastState && !currentState)) fetchCases();
  }, [syncData]);

  return (
    <div className='search-form'>
      <SearchByName
        tree={caseTree}
        selected={[caseId]}
        onSelect={setCaseId}
        recordName='test case'
        referencePrefix='C'
        loading={loading}
        label='Select a test case'
        placeholder='No synced test cases found.'
      >
        {syncing && <SyncProgress syncData={syncData} />}
      </SearchByName>
    </div>
  );
};

export default SelectTestCase;
