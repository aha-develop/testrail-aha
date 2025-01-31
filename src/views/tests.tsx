import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { TestCase, Test, Status } from '../extension';
import { getTestCase, getTest, getStatus } from '../lib/fields';
import RecordLink from '../components/RecordLink';
import { Styles } from '../components/Styles';

type RowProps = {
  caseId: string;
  domain: string;
  record: Aha.RecordStub;
};

function linkTestCase() {
  alert('Linking a test case is not yet implemented');
}

function createTestCase() {
  alert('Creating a test case is not yet implemented');
}

function syncWithTestRail() {
  alert('Syncing with TestRail is not yet implemented');
}

function unlinkCase(record: Aha.RecordStub, caseId: string) {
  alert('Unlinking a test case is not yet implemented');
}

function lastUpdatedAt(timestamp?: number) {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
}

const TestRow: React.FC<RowProps> = ({ caseId, domain, record }) => {
  const [testCase, setTestCase] = useState<TestCase>(null);
  const [test, setTest] = useState<Test>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    async function initData() {
      const testCase = await getTestCase(caseId);
      setTestCase(testCase);

      const test = await getTest(testCase?.latestTestId);
      setTest(test);

      const status = await getStatus(test?.statusId);
      setStatus(status);
    }

    initData();
  }, [caseId]);

  if (!testCase) return null;

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
            onClick={() => unlinkCase(record, testCase.id)}
          >
            <aha-icon icon='fa-regular fa-trash-can' />
          </aha-button>
        </div>
      )}
    </div>
  );
};

const TestsTab: Aha.RenderExtension = ({ record, fields }, { settings }) => {
  const caseIds = fields['caseIds'] as string[] | undefined;
  const lastSynced = fields['lastSynced'] as number | undefined;
  const domain = settings.get('domain') as string | undefined;

  let caseRows = null;

  if (caseIds) {
    caseRows = caseIds.map((caseId, index) => (
      <TestRow
        key={`case-${index}`}
        caseId={caseId}
        record={record}
        domain={domain}
      />
    ));
  }

  return (
    <>
      <Styles />
      <div className='tab-header'>
        <div className='tab-header-left'>
          <h4 className='tab-title'>Tests</h4>
          <aha-button onClick={linkTestCase} kind='link'>
            <aha-icon icon='fa-regular fa-link' />
            Link a test
          </aha-button>
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

aha.on('tests', TestsTab);
