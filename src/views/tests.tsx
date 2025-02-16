import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { IDENTIFIER, TestCase, Test, Status } from '../extension';
import {
  getTestCases,
  getTests,
  getLinkedComments,
  getStatuses,
} from '../lib/extensionFields/queries';
import { unlinkTestCase } from '../lib/extensionFields/updates';
import RecordLink from '../components/RecordLink';
import { Styles } from '../components/Styles';
import LinkTestCase from '../components/LinkTestCase';
import { ExtensionRecord, isExtensionRecord } from '../lib/extensionRecord';
import SmartSpinner from '../components/SmartSpinner';

type RowProps = {
  testCase: TestCase;
  test?: Test;
  comment?: string;
  status?: Status;
  domain: string;
  record: ExtensionRecord;
};

type TabProps = {
  record: ExtensionRecord;
  fields: Record<string, unknown>;
  settings: Aha.Settings;
};

type FeatureTabData = {
  testCases: TestCase[];
  tests: { [caseId: string]: Test };
  comments: { [testId: string]: string };
  statuses: { [key: string]: Status };
};

export async function getFeatureTabData(
  caseIds: string[],
  testIds: string[]
): Promise<FeatureTabData> {
  const testCases = await getTestCases(caseIds);
  const tests = await getTests(testIds);

  const testMap = tests.reduce(
    (acc, test) => ({ ...acc, [test.caseId]: test }),
    {}
  );

  const commentMap = await getLinkedComments(tests);

  const statusIds = tests.map(test => test.statusId);
  const statuses = await getStatuses(statusIds);
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

function createTestCase() {
  alert('Creating a test case is not yet implemented');
}

function syncWithTestRail() {
  alert('Syncing with TestRail is not yet implemented');
}

function lastUpdatedAt(timestamp: number | null) {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
}

const openLinkModal = (setModalOpen, setSpinner) => {
  setModalOpen(true);
  setSpinner(false);
};

const TestRow: React.FC<RowProps> = ({
  testCase,
  test,
  comment,
  status,
  domain,
  record,
}) => {
  return (
    <div className='test-row'>
      <div className='test-row-column'>
        <RecordLink record={testCase} domain={domain} />
        <div>
          <div className='test-title'>{testCase.title}</div>
          {comment && <div className='test-comment'>{comment}</div>}
        </div>
      </div>
      {test && (
        <div className='test-row-column'>
          <RecordLink record={test} domain={domain} />
          {status && <aha-pill color={status.color}>{status.label}</aha-pill>}
          <aha-button
            size='mini'
            kind='icon'
            onClick={() => unlinkTestCase(record, testCase.id)}
          >
            <aha-icon icon='fa-regular fa-trash-can' />
          </aha-button>
        </div>
      )}
    </div>
  );
};

const TestsTab: React.FC<TabProps> = ({ record, fields, settings }) => {
  const caseIds = fields['caseIds'] as string[] | undefined;
  const testIds = fields['testIds'] as string[] | undefined;

  const [retryAt, setRetryAt] = useState<number>(null);
  const [lastSynced, setLastSynced] = useState<number>(null);

  const [tabData, setTabData] = useState<FeatureTabData>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [spinner, setSpinner] = useState<boolean>(false);
  const [eventKey, setEventKey] = useState<string>(null);

  const domain = settings.get('domain') as string | undefined;
  const syncDelay = settings.get('syncDelay') as number | undefined;

  useEffect(() => {
    async function initData() {
      const actualRetryAt = (await aha.account.getExtensionField(
        IDENTIFIER,
        'retryAt'
      )) as number | undefined;

      if (actualRetryAt) setRetryAt(actualRetryAt);

      const tabData = await getFeatureTabData(caseIds, testIds);

      // Refresh lastSynced, as the oldest testcases might have been synced
      let earliestSynced = null;
      for (const testCase of tabData.testCases) {
        if (
          testCase.lastSynced &&
          (!earliestSynced || testCase.lastSynced < earliestSynced)
        ) {
          earliestSynced = testCase.lastSynced;
        }
      }

      setTabData(tabData);
      setLastSynced(earliestSynced);
    }

    initData();
  }, [caseIds]);

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
          key={`case-${testCase.id}-${testCase.lastSynced}`}
          testCase={testCase}
          test={test}
          comment={comment}
          status={status}
          record={record}
          domain={domain}
        />
      );
    });
  }

  return (
    <>
      <Styles />
      {retryAt && retryAt > Date.now() && (
        <div className='mb-5'>
          <aha-alert type='danger' dismissable>
            API rate limit reached. Please try again in a few minutes
          </aha-alert>
        </div>
      )}
      {spinner && (
        <div className='mb-5'>
          <SmartSpinner record={record} eventKey={eventKey} />
        </div>
      )}

      <div className='tab-header'>
        <div className='tab-header-left'>
          <h4 className='tab-title'>Tests</h4>
          <aha-button
            onClick={() => openLinkModal(setModalOpen, setSpinner)}
            kind='link'
          >
            <aha-icon icon='fa-regular fa-link' />
            Link a test
          </aha-button>
          {modalOpen && (
            <LinkTestCase
              domain={domain}
              record={record}
              syncDelay={syncDelay}
              setOpen={setModalOpen}
              setSpinner={setSpinner}
              setEventKey={setEventKey}
            />
          )}
          <aha-button onClick={createTestCase} kind='link'>
            <aha-icon icon='fa-regular fa-circle-plus' aria-hidden='true' />
            Create a test
          </aha-button>
        </div>
        <div className='tab-header-right'>
          <span className='text-light'>
            Last updated: {lastUpdatedAt(lastSynced)}
          </span>
          <aha-button onClick={syncWithTestRail} size='mini' kind='link'>
            Refresh
          </aha-button>
        </div>
      </div>
      <div>{caseRows}</div>
    </>
  );
};

aha.on('tests', ({ record, fields }, { settings }) => {
  if (!isExtensionRecord(record)) return null;

  return <TestsTab record={record} fields={fields} settings={settings} />;
});
