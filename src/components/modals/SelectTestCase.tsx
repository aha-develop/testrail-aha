import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ApiSearch, { TreeNode } from './ApiSearch';
import SyncProgress from '../SyncProgress';
import { IDENTIFIER, Project, TestCase } from '../../extension';
import {
  getAccountExtensionFieldMap,
  getRecords,
  indexKeyForKindAndParent,
} from '../../lib/extensionFields/queries';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';
import SelectProject from './SelectProject';

type Props = {
  syncData: BulkSyncState;
  selectedCaseIds: string[];
  caseIds: number[];
  updateSelectedCaseIds: (caseId: string, isSelected: boolean) => Promise<void>;
  clearSelectedCaseIds: () => void;
};

const SelectTestCase: React.FC<Props> = ({
  syncData,
  selectedCaseIds,
  caseIds,
  updateSelectedCaseIds,
  clearSelectedCaseIds,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null); // True if syncing on initial load
  const [syncingCases, setSyncingCases] = useState(false); // True if there may be new cases to sync

  const [projectId, setProjectId] = useState<number>();
  const [projects, setProjects] = useState<Project[]>([]);

  const [searchMapping, setSearchMapping] = useState<{
    [projectId: number]: number[];
  }>({});

  useEffect(() => {
    const fetchSearchKeys = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const fetchedProjects = (
        await getRecords<Project>(projectIds, 'Project')
      ).reverse();

      if (fetchedProjects?.length > 0 && !projectId) {
        setProjectId(() => fetchedProjects[0].id);
      }

      const keys = fetchedProjects.map(project =>
        indexKeyForKindAndParent('TestCase', project.id)
      );

      const mapping = await getAccountExtensionFieldMap<number[]>(keys);
      setSearchMapping(() => mapping);

      setProjects(() => fetchedProjects);
      setLoading(() => false);
    };

    if (syncData && syncing === null) {
      setSyncing(() => syncData.state !== SyncState.Complete);
    }

    const lastState = syncingCases;
    let currentState = syncingCases;

    if (syncData) {
      currentState = syncData.stage <= SyncStage.TestCases;
      setSyncingCases(() => currentState);
    }

    // Fetch data on first load or if new cases potentially synced
    if (loading || (lastState && !currentState)) fetchSearchKeys();
  }, [syncData]);

  const setProject: (e: React.ChangeEvent<HTMLSelectElement>) => Promise<void> =
    useCallback(
      async event => {
        const id = Number.parseInt(event.target.value);
        setProjectId(() => id);
        clearSelectedCaseIds();
      },
      [clearSelectedCaseIds]
    );

  const buildTree: (
    fields: Aha.ExtensionField[],
    referenceMatches: number[]
  ) => Promise<TreeNode[]> = useCallback(
    async (fields, referenceMatches) => {
      let children = fields.map(field => field.value as TestCase);

      const casesToFetch = referenceMatches.filter(
        id => !children.some(child => child.id === id)
      );

      if (casesToFetch.length > 0) {
        const records = await getRecords<TestCase>(casesToFetch, 'TestCase');
        children = children.concat(records);
      }

      children.sort((a, b) => b.id - a.id);

      const nodes = children.map(record => ({
        value: record.id.toString(),
        text: record.title,
        date: record.createdOn * 1000,
      }));

      const project = projects.find(p => p.id === projectId);

      if (!project || nodes.length === 0) {
        return [];
      }

      return [
        {
          value: projectId.toString(),
          text: project.name,
          children: nodes,
        },
      ];
    },
    [projects, projectId]
  );

  const searchIds = useMemo(
    () => searchMapping[indexKeyForKindAndParent('TestCase', projectId)] || [],
    [searchMapping, projectId]
  );

  return (
    <div className='search-form'>
      <SelectProject
        projects={projects}
        projectId={projectId}
        setProject={setProject}
      />
      <ApiSearch
        searchIds={searchIds}
        selected={selectedCaseIds}
        linkedIds={caseIds}
        searchKind={'TestCase'}
        searchKey={'title'}
        onSelect={updateSelectedCaseIds}
        buildTree={buildTree}
        recordName='test case'
        referencePrefix='C'
        loading={loading}
        label='Select a test case'
        placeholder='No synced test cases found.'
      >
        {syncing && <SyncProgress syncData={syncData} />}
      </ApiSearch>
    </div>
  );
};

export default SelectTestCase;
