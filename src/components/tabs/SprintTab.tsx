import React, { useEffect, useState } from 'react';
import { TestCase, TestRun, Test, Status } from '../../extension';
import {
  getRecords,
  getLinkedComments,
  getRunRowData,
} from '../../lib/extensionFields/queries';
import { timeAgo } from '../../lib/util';
import { Styles } from '../Styles';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState, SyncState } from '../../lib/sync/bulkSync';
import waitForBulkSync from '../../lib/sync/waitForBulkSync';
import LinkTestRun from '../modals/LinkTestRun';
import RunRow from './RunRow';

type TabProps = {
  record: ExtensionRecord;
  fields: Record<string, unknown>;
  settings: Aha.Settings;
};

type TestMap = { [runId: number]: [TestCase, Test][] };

type SprintTabData = {
  runs: TestRun[];
  testMap: TestMap;
  comments: { [testId: number]: { timestamp: number; comment: string } };
  statuses: { [key: string]: Status };
};

const getSprintTabData: (
  runIds: number[]
) => Promise<SprintTabData> = async runIds => {
  const runs = await getRecords<TestRun>(runIds, 'TestRun');
  const [testMap, tests] = await getRunRowData(runs.map(run => run.id));

  const commentMap = await getLinkedComments(tests.map(test => test.id));

  const statusIds = tests.map(test => test.statusId);
  const statuses = await getRecords<Status>(statusIds, 'Status');
  const statusMap = statuses.reduce((acc, status) => {
    acc[status.id] = status;
    return acc;
  }, {});

  return {
    runs,
    testMap,
    comments: commentMap,
    statuses: statusMap,
  };
};

const SprintTab: React.FC<TabProps> = ({ record, fields, settings }) => {
  const runIds = fields['runIds'] as number[] | undefined;

  const [loading, setLoading] = useState(true);
  const [syncData, setSyncData] = useState<BulkSyncState>(null);
  const [tabData, setTabData] = useState<SprintTabData>(null);

  const [linkRunModalOpen, setLinkRunModalOpen] = useState(false);

  // Used to re-trigger the useEffect and reload the data.
  const [reload, setReload] = useState(0);
  const reloadTabData = () => setReload(reload + 1);

  const domain = settings.get('domain') as string | undefined;
  const syncDelay = settings.get('syncDelay') as number | undefined;

  useEffect(() => {
    const initData = async () => {
      const tabData = await getSprintTabData(runIds);

      setTabData(tabData);
      setLoading(false);
    };

    initData();
  }, [runIds, reload]);

  useEffect(() => {
    waitForBulkSync({
      domain,
      syncDelay,
      setState: setSyncData,
      reload: reloadTabData,
    });
  }, []);

  let runRows = null;

  const { runs, testMap, comments, statuses } = tabData || {
    runs: [],
    testMap: {},
    comments: {},
    statuses: {},
  };

  const existingRunIds = runs.map(run => run.id);

  if (runs.length > 0) {
    runRows = runs.map(run => {
      const rows = testMap[run.id] ?? [];

      return (
        <RunRow
          key={`run-${run.id}`}
          run={run}
          rows={rows}
          comments={comments}
          statuses={statuses}
          record={record}
          domain={domain}
        />
      );
    });
  }

  return (
    <>
      <Styles />
      {syncData && syncData.state === SyncState.Timeout && (
        <div className='mb-5'>
          <aha-alert type='danger' dismissable>
            API rate limit reached. Please try again in a few minutes
          </aha-alert>
        </div>
      )}

      <div className='tab-header'>
        <div className='tab-header-left'>
          <div className='h-400'>Test runs</div>
          <aha-button
            kind='secondary'
            onClick={() => setLinkRunModalOpen(true)}
          >
            <aha-icon icon='fa-regular fa-link' />
            Link a test run
          </aha-button>
        </div>
        {linkRunModalOpen && (
          <LinkTestRun
            record={record}
            runIds={existingRunIds}
            syncData={syncData}
            onClose={() => setLinkRunModalOpen(false)}
          />
        )}
        <div className='tab-header-right'>
          {syncData && (
            <>
              <span className='text-small text-light'>
                Last updated: {timeAgo(syncData.lastSync)}
              </span>
              {syncData.state === SyncState.Errored && (
                <span className='text-small text-light text-error'>
                  Failed to sync
                </span>
              )}
              <aha-button
                onClick={() =>
                  waitForBulkSync({
                    domain,
                    syncDelay: 0,
                    setState: setSyncData,
                    reload: reloadTabData,
                  })
                }
                disabled={syncData.state === SyncState.Running ? true : null}
                size='mini'
                kind='link'
              >
                {syncData.state === SyncState.Running
                  ? 'Refreshing'
                  : 'Refresh'}
              </aha-button>
            </>
          )}
        </div>
      </div>
      <div className='run-rows'>
        {loading ? <aha-loading-row rows={5} columns={2} /> : runRows}
      </div>
    </>
  );
};

export default SprintTab;
