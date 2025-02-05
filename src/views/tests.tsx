import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { IDENTIFIER, TestCase, Test, Status } from '../extension';
import { unlinkTestCase, getFeatureTabData } from '../lib/fields';
import RecordLink from '../components/RecordLink';
import { Styles } from '../components/Styles';
import LinkTestCase from '../components/LinkTestCase';
import { ExtensionRecord, isExtensionRecord } from '../lib/extensionRecord';
import SmartSpinner from '../components/SmartSpinner';

type RowProps = {
  testCase: TestCase;
  test?: Test;
  status?: Status;
  domain: string;
  record: ExtensionRecord;
};

type TabProps = {
  record: ExtensionRecord;
  fields: Record<string, unknown>;
  settings: Aha.Settings;
};

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
          {test?.latestComment && (
            <div className='test-comment'>{test.latestComment}</div>
          )}
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
  const [retryAt, setRetryAt] = useState<number>(null);
  const [lastSynced, setLastSynced] = useState<number>(null);

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [tests, setTests] = useState<{ [id: string]: Test }>({});
  const [statuses, setStatuses] = useState<{ [id: string]: Status }>({});

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

      const { testCases, tests, statuses } = await getFeatureTabData(caseIds);

      // Refresh lastSynced, as the oldest testcases might have been synced
      let earliestSynced = null;
      for (const testCase of testCases) {
        if (
          testCase.lastSynced &&
          (!earliestSynced || testCase.lastSynced < earliestSynced)
        ) {
          earliestSynced = testCase.lastSynced;
        }
      }

      // Set everything at once to avoid multiple re-renders
      setTestCases(testCases);
      setTests(tests);
      setStatuses(statuses);
      setLastSynced(earliestSynced);
    }

    initData();
  }, [caseIds]);

  let caseRows = null;

  if (caseIds) {
    caseRows = testCases.map(testCase => {
      const test = tests[testCase.latestTestId];
      const status = test && statuses[test.statusId];

      return (
        <TestRow
          key={`case-${testCase.id}-${testCase.lastSynced}`}
          testCase={testCase}
          test={test}
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
