import React, { useEffect, useState } from 'react';
import { TestCase, Test, Status } from '../extension';
import { getRecords, getLinkedComments } from '../lib/extensionFields/queries';
import { unlinkRecord } from '../lib/extensionFields/updates';
import { timeAgo, formatTime, numberToColor } from '../lib/util';
import RecordLink from '../components/RecordLink';
import { Styles } from '../components/Styles';
import LinkTestCase from '../components/LinkTestCase';
import LinkTest from '../components/linkTest/LinkTest';
import CreateTestCase from '../components/CreateTestCase';
import LinkTestToTestCase from '../components/LinkTestToTestCase';
import { ExtensionRecord, isExtensionRecord } from '../lib/extensionRecord';
import { BulkSyncState, SyncState } from '../lib/sync/bulkSync';
import waitForBulkSync from '../lib/sync/waitForBulkSync';

type RowProps = {
  testCase: TestCase;
  test?: Test;
  comment?: { timestamp: number; comment: string };
  status?: Status;
  domain: string;
  record: ExtensionRecord;
  syncData: BulkSyncState;
};

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

const TestRow: React.FC<RowProps> = ({
  testCase,
  test,
  comment,
  status,
  domain,
  record,
  syncData,
}) => {
  const [linkTestModalOpen, setLinkTestModalOpen] = useState(false);

  const unlink = () => {
    unlinkRecord(record, testCase.id, 'caseIds');
    if (test) unlinkRecord(record, test.id, 'testIds');
  };

  return (
    <div className='test-row'>
      <div className='test-row-column'>
        <div className='test-ref'>
          <RecordLink record={testCase} domain={domain} />
        </div>
        <div>
          <div className='test-title'>{testCase.title}</div>
          {comment && <div className='text-gray'>{comment.comment}</div>}
        </div>
      </div>
      <div className='test-row-column'>
        {test ? (
          <>
            {comment && (
              <div className='text-light'>
                {formatTime(comment.timestamp * 1000)}
              </div>
            )}
            <RecordLink record={test} domain={domain} />
            {status && (
              <aha-pill color={numberToColor(status.colorMedium)}>
                {status.label}
              </aha-pill>
            )}
          </>
        ) : (
          <>
            <aha-button
              size='small'
              kind='link'
              onClick={() => setLinkTestModalOpen(true)}
            >
              <aha-icon icon='fa-regular fa-link' />
              Link to test
            </aha-button>
            {linkTestModalOpen && (
              <LinkTestToTestCase
                record={record}
                testCase={testCase}
                syncData={syncData}
                onClose={() => setLinkTestModalOpen(false)}
              />
            )}
          </>
        )}
        <aha-button size='mini' kind='icon' onClick={unlink}>
          <aha-icon icon='fa-regular fa-trash-can' />
        </aha-button>
      </div>
    </div>
  );
};

const TestsTab: React.FC<TabProps> = ({ record, fields, settings }) => {
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
      waitForBulkSync({
        domain,
        syncDelay,
        setState: setSyncData,
        reload: reloadTabData,
      });

      setLoading(false);
    }

    initData();
  }, [caseIds, testIds, reload]);

  let caseRows = null;

  const { testCases, tests, comments, statuses } = tabData || {
    testCases: [],
    tests: {},
    comments: {},
    statuses: [],
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
              <aha-icon icon='fa-regular fa-circle-plus' />
              Add
            </aha-button>
            <aha-menu-content>
              <aha-menu-item>
                <a onClick={() => setLinkCaseModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test case
                </a>
              </aha-menu-item>
              <aha-menu-item>
                <a onClick={() => setLinkTestModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test
                </a>
              </aha-menu-item>
              <aha-menu-item>
                <a onClick={() => setCreateCaseModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-circle-plus' />
                  Create a test case
                </a>
              </aha-menu-item>
            </aha-menu-content>
          </aha-menu>
        </div>
        {linkCaseModalOpen && (
          <LinkTestCase
            record={record}
            syncData={syncData}
            onClose={onClose(setLinkCaseModalOpen)}
          />
        )}
        {linkTestModalOpen && (
          <LinkTest
            record={record}
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

aha.on('tests', ({ record, fields }, { settings }) => {
  if (!isExtensionRecord(record)) return null;

  return <TestsTab record={record} fields={fields} settings={settings} />;
});
