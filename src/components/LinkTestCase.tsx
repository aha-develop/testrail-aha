import React, { useRef, useState } from 'react';
import { IDENTIFIER } from '../extension';
import { getTestCases } from '../lib/extensionFields/queries';
import { linkTestCase } from '../lib/extensionFields/updates';
import { ExtensionRecord } from '../lib/extensionRecord';

type Props = {
  domain: string;
  record: ExtensionRecord;
  syncDelay: number | null;
  setOpen: (open: boolean) => void;
  setSpinner: (spinner: boolean) => void;
  setEventKey: (string) => void;
};

type LinkOrSyncProps = {
  record: ExtensionRecord;
  caseId: string;
  syncDelay: number | null;
};

// Checks if we can use local data for a linked test case.
// Returns false if the test case must be synced.
const linkOrSyncTestCase: (LinkOrSyncProps) => Promise<boolean> = async ({
  record,
  caseId,
  syncDelay,
}) => {
  const testCases = await getTestCases([caseId]);
  if (testCases.length === 0) return false;

  const testCase = testCases[0];

  if (!testCase?.lastSynced) return false;

  if (syncDelay < 0 || testCase.lastSynced + syncDelay * 1000 > Date.now()) {
    linkTestCase(record, caseId);

    return true;
  } else {
    return false;
  }
};

const LinkTestCase: React.FC<Props> = ({
  domain,
  record,
  syncDelay,
  setOpen,
  setSpinner,
  setEventKey,
}) => {
  const [validation, setValidation] = useState(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = async () => {
    const caseId = inputRef.current?.value;

    if (!caseId) {
      setValidation('Please enter a Test Case ID');
      return;
    }

    if (!/^\d+$/.test(caseId)) {
      setValidation('Test Case ID must be a valid number');
      return;
    }

    setValidation(null);

    const cached = await linkOrSyncTestCase({
      record,
      caseId,
      syncDelay,
    });

    if (!cached) {
      const eventKey = `linkTestCase_${caseId}_${Date.now()}`;

      aha.triggerServer(`${IDENTIFIER}.linkTestCase`, {
        id: record.id,
        domain,
        typename: record.typename,
        caseId,
        eventKey,
      });

      setEventKey(eventKey);
      setSpinner(true);
    }

    setOpen(false);
  };

  return (
    <aha-modal open position='center' size='medium'>
      <aha-modal-header modalTitle='Link Test Case'>
        Link Test Case
      </aha-modal-header>
      <aha-modal-body>
        <aha-field required={true}>
          <div slot='label'>Test Case ID</div>
          <input
            ref={inputRef}
            type='number'
            placeholder='Enter a Test Case ID without the "C" e.g. 123'
          />
          {validation && <div slot='error'>{validation}</div>}
        </aha-field>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button kind='secondary' onClick={() => setOpen(false)}>
          Cancel
        </aha-button>
        <aha-button kind='primary' onClick={handleButtonClick}>
          Submit
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestCase;
