import React, { useRef, useState } from 'react';
import { IDENTIFIER } from '../../extension';
import { getTestCases } from '../../lib/extensionFields/queries';
import { linkTestCase } from '../../lib/extensionFields/updates';
import { ExtensionRecord } from '../../lib/extensionRecord';
import SmartSpinner from '../SmartSpinner';

type Props = {
  domain: string;
  record: ExtensionRecord;
};

type LinkOrSyncProps = {
  caseId: string;
};

const testCaseSynced: (props: LinkOrSyncProps) => Promise<boolean> = async ({
  caseId,
}) => {
  const testCases = await getTestCases([caseId]);

  return testCases.length !== 0;
};

const LinkByIdForm: React.FC<Props> = ({ domain, record }) => {
  const [syncing, setSyncing] = useState(false);
  const [validation, setValidation] = useState(null);
  const [eventKey, setEventKey] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const spinnerCleanup = () => {
    setSyncing(false);
    setEventKey(null);
  };

  const handleButtonClick = async () => {
    setMessage(null);
    setError(null);

    const caseId = inputRef.current?.value;

    if (!caseId) {
      setValidation('Please enter a test case ID');
      return;
    }

    if (!/^[cC]?\d+$/.test(caseId)) {
      setValidation('Invalid test case ID format');
      return;
    }

    setValidation(null);

    const caseIdNum = caseId.replace(/[cC]/, '');

    setSyncing(true);
    setMessage('Checking if test case already synced...');

    const cached = await testCaseSynced({
      caseId: caseIdNum,
    });

    if (!cached) {
      setMessage('Syncing test case from TestRail...');

      const eventKey = `linkTestCase_${caseId}_${Date.now()}`;
      setEventKey(eventKey);

      aha.triggerServer(`${IDENTIFIER}.linkTestCase`, {
        id: record.id,
        domain,
        typename: record.typename,
        caseId,
        eventKey,
      });
    } else {
      setMessage('Test case found, linking to record...');
      await linkTestCase(record, caseId);
      setMessage('Test case linked successfully');

      spinnerCleanup();
    }
  };

  return (
    <>
      <div className='id-form'>
        <div>
          <input
            ref={inputRef}
            type='text'
            placeholder='Enter a test case ID'
            style={{ width: '300px' }}
          />

          {validation ? (
            <div className='ml-1 error'>{validation}</div>
          ) : (
            <div className='ml-1 text-gray'>Example: C123</div>
          )}
        </div>
        <aha-button
          kind='primary'
          disabled={syncing ? true : null}
          onClick={handleButtonClick}
        >
          {syncing ? 'Linking...' : 'Link test case'}
        </aha-button>
        <div className='spinner'>
          {syncing && eventKey && (
            <SmartSpinner
              record={record}
              eventKey={eventKey}
              cleanup={spinnerCleanup}
              setMessage={setMessage}
              setError={setError}
            />
          )}
          {message && <span>{message}</span>}
          {error && <span className='text-error'>{error}</span>}
        </div>
      </div>
    </>
  );
};

export default LinkByIdForm;
