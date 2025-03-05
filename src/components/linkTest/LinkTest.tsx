import React, { useState, useEffect, useRef } from 'react';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import SelectTestCase from './SelectTestCase';
import SelectTest from './SelectTest';
import { linkRecord } from '../../lib/extensionFields/updates';

type Props = {
  record: ExtensionRecord;
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTest: React.FC<Props> = ({ record, syncData, onClose }) => {
  const modalRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [caseId, setCaseId] = useState<string>(null);
  const [testId, setTestId] = useState<string>(null);
  const [caseStep, setCaseStep] = useState<boolean>(true);

  const testIdRef = useRef(testId);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, []);

  const updateTestId = async value => {
    testIdRef.current = value;
    setTestId(value);
  };

  const submit = async () => {
    if (!testIdRef.current) return;

    setSaving(true);

    await linkRecord(record, Number.parseInt(caseId), 'caseIds');
    await linkRecord(record, Number.parseInt(testIdRef.current), 'testIds');

    setSaving(false);
    onClose();
  };

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test'>Link test</aha-modal-header>
      <aha-modal-body>
        {!syncData?.lastSync && (
          <aha-alert class='mb-5' type='warning' dismissable>
            <div slot='heading'>We haven't fully synced with TestRail yet.</div>
            We're still gathering data from the TestRail API, so search results
            will be incomplete. Please remain on the tests tab until it has
            finished.
          </aha-alert>
        )}
        <div style={{ display: caseStep ? 'block' : 'none' }}>
          <SelectTestCase
            record={record}
            syncData={syncData}
            caseId={caseId}
            setCaseId={async (value: string) => setCaseId(value)}
          />
        </div>
        <div style={{ display: caseStep ? 'none' : 'block' }}>
          <SelectTest
            syncData={syncData}
            caseId={caseId}
            testId={testId}
            updateTestId={updateTestId}
          />
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <div style={{ display: caseStep ? 'block' : 'none' }}>
          <aha-button
            kind='primary'
            disabled={!caseId ? true : null}
            onClick={() => setCaseStep(false)}
          >
            Next
          </aha-button>
        </div>
        <div
          className='search-column'
          style={{ display: caseStep ? 'none' : 'flex' }}
        >
          <aha-button
            kind='primary'
            disabled={saving ? true : null}
            onClick={() => {
              setCaseStep(true);
              updateTestId(null);
            }}
          >
            Back
          </aha-button>
          <aha-button
            kind='primary'
            disabled={saving || !testId ? true : null}
            onClick={submit}
          >
            {saving ? 'Linking...' : 'Link to test'}
          </aha-button>
        </div>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTest;
