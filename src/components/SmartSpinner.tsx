import React, { useEffect, useState } from 'react';
import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from '../lib/extensionRecord';

type Props = {
  record: ExtensionRecord;
  eventKey: string;
};

type APIResult = {
  message?: string;
  error?: boolean;
};

const MAX_POLL_TIME = 5 * 60 * 1000;
const INTERVAL_TIME = 1 * 1000;

// Any TestRail API calls need to go through server-side code. They store the result in an extension field.
// We poll the field until it is populated or the timeout has elapsed, at which point we assume it failed.
const SmartSpinner: React.FC<Props> = ({ record, eventKey }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const initialTime = Date.now();

  useEffect(() => {
    const pollResult = async () => {
      if (!loading) {
        return;
      }

      const elapsedTime = Date.now() - initialTime;
      if (elapsedTime > MAX_POLL_TIME) {
        setError(true);
        setMessage(
          'Unknown error occured - check invocation logs for more information'
        );
        setLoading(false);
      }

      const result = await record.getExtensionField<APIResult | null>(
        IDENTIFIER,
        eventKey
      );

      if (result?.message) {
        setError(result.error);
        setMessage(result.message);
        record.clearExtensionField(IDENTIFIER, eventKey);
        setLoading(false);
      } else {
        setTimeout(pollResult, INTERVAL_TIME);
      }
    };

    setTimeout(pollResult, INTERVAL_TIME);

    return () => {
      // Clear the extension field so we aren't fetching stale data
      record.clearExtensionField(IDENTIFIER, eventKey);
    };
  }, []);

  return (
    <div className='spinner'>
      {loading && <aha-spinner size='3ex' />}
      {!loading && error && <span className='spinner-error'>{message}</span>}
      {!loading && !error && <span>{message}</span>}
    </div>
  );
};

export default SmartSpinner;
