import React, { useEffect, useState } from 'react';
import { TestCase, Test, Status } from '../../extension';
import {
  getRecords,
  getLinkedComments,
} from '../../lib/extensionFields/queries';
import { timeAgo } from '../../lib/util';
import { Styles } from '../Styles';
import LinkTestCase from '../modals/LinkTestCase';
import LinkTest from '../modals/LinkTest';
import CreateTestCase from '../modals/CreateTestCase';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState, SyncState } from '../../lib/sync/bulkSync';
import waitForBulkSync from '../../lib/sync/waitForBulkSync';
import TestRow from './TestRow';

type TabProps = {
  record: ExtensionRecord;
  fields: Record<string, unknown>;
  settings: Aha.Settings;
};

type FeatureTabData = {
  testCases: TestCase[];
  tests: { [caseId: number]: Test };
  comments: { [testId: number]: { timestamp: number; comment: string } };
  statuses: { [key: string]: Status };
};

export async function getFeatureTabData(
  caseIds: number[],
  testIds: number[]
): Promise<FeatureTabData> {
  const testCases = await getRecords<TestCase>(caseIds, 'TestCase');
  const tests = await getRecords<Test>(testIds, 'Test');

  const testMap = tests.reduce(
    (acc, test) => ({ ...acc, [test.caseId]: test }),
    {}
  );

  const commentMap = await getLinkedComments(tests);

  const statusIds = tests.map(test => test.statusId);
  const statuses = await getRecords<Status>(statusIds, 'Status');
  const statusMap = statuses.reduce((acc, status) => {
    acc[status.id] = status;
    return acc;
  }, {});

  return {
    testCases,
    tests: testMap,
    comments: commentMap,
    statuses: statusMap,
  };
}

const FeatureTab: React.FC<TabProps> = ({ record, fields, settings }) => {
  const caseIds = fields['caseIds'] as number[] | undefined;
  const testIds = fields['testIds'] as number[] | undefined;

  const [loading, setLoading] = useState(true);
  const [syncData, setSyncData] = useState<BulkSyncState>(null);
  const [tabData, setTabData] = useState<FeatureTabData>(null);

  const [linkCaseModalOpen, setLinkCaseModalOpen] = useState(false);
  const [linkTestModalOpen, setLinkTestModalOpen] = useState(false);
  const [createCaseModalOpen, setCreateCaseModalOpen] = useState(false);

  // Used to re-trigger the useEffect and reload the data.
  const [reload, setReload] = useState(0);

  const reloadTabData = () => setReload(reload + 1);

  const onClose = (setter: (value: boolean) => void) => () => setter(false);

  const domain = settings.get('domain') as string | undefined;
  const syncDelay = settings.get('syncDelay') as number | undefined;

  useEffect(() => {
    async function initData() {
      const tabData = await getFeatureTabData(caseIds, testIds);

      setTabData(tabData);
      setLoading(false);
    }

    initData();
  }, [caseIds, testIds, reload]);

  useEffect(() => {
    waitForBulkSync({
      domain,
      syncDelay,
      setState: setSyncData,
      reload: reloadTabData,
    });
  }, []);

  let caseRows = null;

  const { testCases, tests, comments, statuses } = tabData || {
    testCases: [],
    tests: {},
    comments: {},
    statuses: {},
  };

  if (caseIds) {
    caseRows = testCases.map(testCase => {
      const test = tests[testCase.id];
      const status = test && statuses[test.statusId];
      const comment = test ? comments[test.id] : null;

      return (
        <TestRow
          key={`case-${testCase.id}`}
          testCase={testCase}
          test={test}
          comment={comment}
          status={status}
          record={record}
          domain={domain}
          syncData={syncData}
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
          <div className='h-400'>Tests</div>
          <aha-menu>
            <aha-button kind='secondary' slot='control'>
              <aha-icon icon='fa-regular fa-link' />
              Link a test
            </aha-button>
            <aha-menu-content>
              <aha-menu-item>
                <a onClick={() => setLinkTestModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test
                </a>
              </aha-menu-item>
              <aha-menu-item>
                <a onClick={() => setLinkCaseModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test case
                </a>
              </aha-menu-item>
            </aha-menu-content>
          </aha-menu>
          <aha-button
            kind='secondary'
            onClick={() => setCreateCaseModalOpen(true)}
          >
            <aha-icon icon='fa-regular fa-circle-plus' />
            Create a test case
          </aha-button>
        </div>
        {linkCaseModalOpen && (
          <LinkTestCase
            record={record}
            caseIds={caseIds}
            syncData={syncData}
            onClose={onClose(setLinkCaseModalOpen)}
          />
        )}
        {linkTestModalOpen && (
          <LinkTest
            record={record}
            caseIds={caseIds}
            syncData={syncData}
            onClose={onClose(setLinkTestModalOpen)}
          />
        )}
        {createCaseModalOpen && (
          <CreateTestCase
            domain={domain}
            record={record}
            syncData={syncData}
            onClose={onClose(setCreateCaseModalOpen)}
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
      <div>{loading ? <aha-loading-row rows={5} columns={2} /> : caseRows}</div>
    </>
  );
};

export default FeatureTab;
