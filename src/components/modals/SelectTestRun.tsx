import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ApiSearch, { TreeNode } from './ApiSearch';
import SyncProgress from '../SyncProgress';
import { Project, TestRun } from '../../extension';
import {
  getAccountExtensionFieldMap,
  getRecords,
  indexKeyForKindAndParent,
} from '../../lib/extensionFields/queries';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';

type Props = {
  syncData: BulkSyncState;
  selectedRunIds: string[];
  runIds: number[];
  projects: Project[];
  projectId: number;
  updateSelectedRuns: (
    runId: string,
    isSelected: boolean,
    meta?: any
  ) => Promise<void>;
};

const SelectTestRun: React.FC<Props> = ({
  syncData,
  selectedRunIds,
  runIds,
  projects,
  projectId,
  updateSelectedRuns,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null); // True if syncing on initial load
  const [syncStage, setSyncStage] = useState(syncData?.stage);

  const [searchMapping, setSearchMapping] = useState<{
    [projectId: number]: number[];
  }>({});

  useEffect(() => {
    const fetchSearchKeys = async () => {
      const keys = projects.map(project =>
        indexKeyForKindAndParent('TestRun', project.id)
      );

      const mapping = await getAccountExtensionFieldMap<number[]>(keys);
      setSearchMapping(() => mapping);
      setLoading(() => false);
    };

    let shouldFetch = loading;

    if (
      projects.length >= 0 &&
      !shouldFetch &&
      Object.keys(searchMapping).length === 0
    ) {
      shouldFetch = true;
    }

    if (syncData && syncing === null) {
      setSyncing(() => syncData.state !== SyncState.Complete);
    }

    const lastStage = syncStage;
    let currentStage = syncStage;

    if (syncData) {
      currentStage = syncData.stage;
      setSyncStage(() => currentStage);
    }

    if (!shouldFetch)
      shouldFetch =
        lastStage &&
        lastStage >= SyncStage.OpenRuns &&
        lastStage <= SyncStage.CompletedPlans &&
        lastStage !== currentStage;

    // Fetch data on first load or if new runs potentially synced
    if (shouldFetch) fetchSearchKeys();
  }, [projects, syncData]);

  const buildTree: (
    fields: Aha.ExtensionField[],
    referenceMatches: number[]
  ) => Promise<TreeNode[]> = useCallback(
    async (fields, referenceMatches) => {
      let children = fields.map(field => field.value as TestRun);

      const runsToFetch = referenceMatches.filter(
        id => !children.some(child => child.id === id)
      );

      if (runsToFetch.length > 0) {
        const records = await getRecords<TestRun>(runsToFetch, 'TestRun');
        children = children.concat(records);
      }

      children.sort((a, b) => b.id - a.id);

      const nodes = children.map(record => ({
        value: record.id.toString(),
        text: record.name,
        date: record.createdOn * 1000,
        meta: record,
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
    () => searchMapping[indexKeyForKindAndParent('TestRun', projectId)] || [],
    [searchMapping, projectId]
  );

  return (
    <ApiSearch
      searchIds={searchIds}
      selected={selectedRunIds}
      linkedIds={runIds}
      searchKind={'TestRun'}
      searchKey={'name'}
      onSelect={updateSelectedRuns}
      buildTree={buildTree}
      recordName='test run'
      referencePrefix='R'
      loading={loading}
      label='Select a test run'
      placeholder='No synced test runs found.'
    >
      {syncing && <SyncProgress syncData={syncData} />}
    </ApiSearch>
  );
};

export default SelectTestRun;
