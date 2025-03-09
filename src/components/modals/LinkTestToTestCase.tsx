import React, { useEffect, useState, useRef } from 'react';
import { TestCase } from '../../extension';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { linkRecord } from '../../lib/extensionFields/updates';
import SelectTest from './SelectTest';

type Props = {
  record: ExtensionRecord;
  testCase: TestCase;
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTestToTestCase: React.FC<Props> = ({
  record,
  testCase,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [testId, setTestId] = useState<string>(null);
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

    await linkRecord(record, Number.parseInt(testIdRef.current), 'testIds');

    setSaving(false);
    onClose();
  };

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test case to test'>
        Link test case to test
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
        <SelectTest
          caseId={testCase.id.toString()}
          syncData={syncData}
          testId={testId}
          updateTestId={updateTestId}
        />
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={saving || !testId ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link to test'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestToTestCase;
