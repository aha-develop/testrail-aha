import React, { useState } from 'react';
import { TestCase, Test, Status } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import { formatTime, numberToColor } from '../../lib/util';
import { unlinkRecord } from '../../lib/extensionFields/updates';
import RecordLink from '../RecordLink';
import LinkTestToTestCase from '../modals/LinkTestToTestCase';

type RowProps = {
  testCase: TestCase;
  test?: Test;
  comment?: { timestamp: number; comment: string };
  status?: Status;
  domain: string;
  record: ExtensionRecord;
  syncData?: BulkSyncState;
  canDelete?: boolean;
};

const TestRow: React.FC<RowProps> = ({
  testCase,
  test,
  comment,
  status,
  domain,
  record,
  syncData,
  canDelete = true,
}) => {
  const [linkTestModalOpen, setLinkTestModalOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlink = async () => {
    setUnlinking(true);
    setError(null);
    try {
      await unlinkRecord(record, testCase.id, 'caseIds');
      if (test) await unlinkRecord(record, test.id, 'testIds');
    } catch (error) {
      setError(error.message || 'Could not unlink test case. Please try again.');
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className='test-row'>
      <div className='test-row-column'>
        <div className='test-ref'>
          <RecordLink record={testCase} domain={domain} />
        </div>
        <div>
          <div className='test-title'>{testCase.title}</div>
          {error && <aha-alert type='danger'>{error}</aha-alert>}
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
              <aha-pill
                class='test-status'
                color={numberToColor(status.colorMedium)}
              >
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
        {canDelete && (
          <aha-button
            size='mini'
            kind='icon'
            onClick={unlink}
            disabled={unlinking ? true : null}
          >
            <aha-icon icon='fa-regular fa-trash-can' />
          </aha-button>
        )}
      </div>
    </div>
  );
};

export default TestRow;
