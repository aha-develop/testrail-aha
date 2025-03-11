import React, { useEffect, useState, useRef } from 'react';
import { IDENTIFIER, Project, TestRun } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import SearchByName, { TreeNode } from './SearchByName';
import {
  getRecords,
  getProjectRecords,
} from '../../lib/extensionFields/queries';
import { linkRecord } from '../../lib/extensionFields/updates';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';
import SyncProgress from '../SyncProgress';

type Props = {
  record: ExtensionRecord;
  runIds: number[] | undefined;
  syncData: BulkSyncState;
  onClose: () => void;
};

const runOptions: (
  projects: Project[],
  runMapping: {
    [projectId: string]: TestRun[];
  },
  runIds: number[]
) => TreeNode[] = (projects, runMapping, runIds) => {
  const options: TreeNode[] = [];

  let idMapping: { [runId: number]: boolean } = [];

  if (runIds && runIds.length) {
    idMapping = runIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
  }

  for (const project of projects) {
    const runs = runMapping[project.id] || [];

    const openRuns = [];
    const completedRuns = [];

    for (const run of runs) {
      if (idMapping[run.id]) continue;

      if (run.completed) {
        completedRuns.push(run);
      } else {
        openRuns.push(run);
      }
    }

    let openHeader: TreeNode = null;
    let completedHeader: TreeNode = null;

    if (openRuns.length) {
      openHeader = {
        value: project.id.toString(),
        text: 'Open runs',
        header: true,
        children: openRuns.map(r => ({
          text: r.name,
          value: `${r.id}`,
          date: r.createdOn * 1000,
        })),
      };
    }

    if (completedRuns.length) {
      completedHeader = {
        value: project.id.toString(),
        text: 'Completed runs',
        header: true,
        children: completedRuns.map(r => ({
          text: r.name,
          value: `${r.id}`,
          date: r.createdOn * 1000,
        })),
      };
    }

    const children = [openHeader, completedHeader].filter(Boolean);

    if (children.length === 0) continue;

    const header: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      children,
    };

    options.push(header);
  }

  return options;
};

const findChild: (node: TreeNode, value: string) => boolean = (node, value) => {
  if (node.value === value) {
    return true;
  }

  if (!node.children) return false;

  for (const child of node.children) {
    if (findChild(child, value)) {
      return true;
    }
  }

  return false;
};

const LinkTestRun: React.FC<Props> = ({
  record,
  runIds,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const runIdRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [syncing, setSyncing] = useState(null);
  const [syncStage, setSyncStage] = useState(syncData?.stage);

  const [runId, setRunId] = useState<string>(null);
  const [runTree, setRunTree] = useState<TreeNode[]>([]);

  const updateRunId = async value => {
    runIdRef.current = value; // Use this as a cache, the state is not updated immediately
    setRunId(value);
  };

  const submit = async () => {
    if (!runIdRef.current) return;

    setSaving(true);

    await linkRecord(record, Number.parseInt(runIdRef.current), 'runIds');

    setSaving(false);
    onClose();
  };

  useEffect(() => {
    const fetchRuns = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [runMapping, projects] = await Promise.all([
        getProjectRecords<TestRun>(projectIds, 'TestRun'),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      setRunTree(runOptions(projects, runMapping, runIds));
      setLoading(false);
    };

    if (syncData && syncing === null) {
      setSyncing(syncData.state !== SyncState.Complete);
    }

    const lastStage = syncStage;
    let currentStage = syncStage;

    if (syncData) {
      currentStage = syncData.stage;
      setSyncStage(currentStage);
    }

    const syncedRuns =
      lastStage &&
      lastStage >= SyncStage.OpenRuns &&
      lastStage <= SyncStage.CompletedPlans &&
      lastStage !== currentStage;

    if (loading || syncedRuns) fetchRuns();
  }, [syncData]);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test run'>
        Link test run
      </aha-modal-header>
      <aha-modal-body>
        {syncData && !syncData.lastSync && (
          <aha-alert class='mb-5' type='warning' dismissable>
            <div slot='heading'>We haven't fully synced with TestRail yet.</div>
            We're still gathering data from the TestRail API, so search results
            will be incomplete. Please remain on the tests tab until it has
            finished.
          </aha-alert>
        )}
        <div className='search-form'>
          <SearchByName
            tree={runTree}
            selected={[runId]}
            onSelect={updateRunId}
            recordName='test run'
            showReference={true}
            referencePrefix='R'
            loading={loading}
            label='Select a test run'
            placeholder='No synced test runs found.'
          >
            {syncing && <SyncProgress syncData={syncData} />}
          </SearchByName>
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={loading || saving || !runId ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link test run'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestRun;
