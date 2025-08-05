import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import SelectTestCase from './SelectTestCase';
import { linkRecords } from '../../lib/extensionFields/updates';

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

  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  const submit = useCallback(async () => {
    setSaving(() => true);

    await linkRecords(
      record,
      selectedCaseIds.map(id => Number.parseInt(id)),
      'caseIds'
    );

    setSaving(() => false);
    onClose();
  }, [record, selectedCaseIds, onClose]);

  const updateSelectedCaseIds: (
    value: string,
    isSelected: boolean
  ) => Promise<void> = useCallback(
    async (value: string, isSelected: boolean) => {
      setSelectedCaseIds(prev => {
        if (caseIds.includes(Number.parseInt(value))) {
          return prev;
        }

        if (isSelected) {
          return [...prev, value];
        } else {
          return prev.filter(id => id !== value);
        }
      });
    },
    [caseIds]
  );

  const clearSelectedCaseIds = useCallback(() => {
    setSelectedCaseIds(() => []);
  }, []);

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
          selectedCaseIds={selectedCaseIds}
          updateSelectedCaseIds={updateSelectedCaseIds}
          clearSelectedCaseIds={clearSelectedCaseIds}
        />
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={saving || !selectedCaseIds.length ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link to test case'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestCase;
