import React, { useEffect, useState, useRef } from 'react';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import SelectTestCase from './SelectTestCase';
import { linkRecord } from '../../lib/extensionFields/updates';

type Props = {
  record: ExtensionRecord;
  caseIds: number[];
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTestCase: React.FC<Props> = ({
  record,
  caseIds,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);

  const [caseId, setCaseId] = useState<string>(null);
  const [saving, setSaving] = useState(false);

  const caseIdRef = useRef<string>(null);

  const updateCaseId = async (value: string) => {
    caseIdRef.current = value;
    setCaseId(value);
  };

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  const submit = async () => {
    if (!caseIdRef.current) return;

    setSaving(true);

    await linkRecord(record, Number.parseInt(caseIdRef.current), 'caseIds');

    setSaving(false);
    onClose();
  };

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test case'>
        Link test case
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
        <SelectTestCase
          caseIds={caseIds}
          syncData={syncData}
          caseId={caseId}
          setCaseId={updateCaseId}
        />
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={saving || !caseId ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link to test case'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestCase;
