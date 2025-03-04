import React, { useEffect, useState } from 'react';
import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from '../lib/extensionRecord';
import { sleep } from '../lib/util';
import { LambdaResult } from '../lib/sync/interface';

type Props = {
  record: ExtensionRecord;
  eventKey: string;
  cleanup: () => void;
  setError: (error: string) => void;
  setMessage: (message: string) => void;
};

const MAX_POLL_TIME = 5 * 60 * 1000;
const INTERVAL_TIME = 1 * 1000;

// Any TestRail API calls need to go through server-side code. They store the result in an extension field.
// We poll the field until it is populated or the timeout has elapsed, at which point we assume it failed.
const SmartSpinner: React.FC<Props> = ({
  record,
  eventKey,
  cleanup,
  setError,
  setMessage,
}) => {
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const pollResult = async initialTime => {
      if (!loading) {
        return;
      }

      while (true) {
        const elapsedTime = Date.now() - initialTime;

        if (elapsedTime > MAX_POLL_TIME) {
          setError(
            'Unknown error occured - check invocation logs for more information'
          );
          setMessage(null);
          setLoading(false);
          cleanup();
          return;
        }

        await sleep(INTERVAL_TIME);

        const result = await record.getExtensionField<LambdaResult>(
          IDENTIFIER,
          eventKey
        );

        if (result?.message) {
          if (result.error) {
            setError(result.message);
            setMessage(null);
          } else {
            setMessage(result.message);
            setError(null);
          }

          await record.clearExtensionField(IDENTIFIER, eventKey);
          setLoading(false);
          cleanup();

          return;
        }
      }
    };

    pollResult(Date.now());

    return () => {
      // Clear the extension field so we aren't fetching stale data
      record.clearExtensionField(IDENTIFIER, eventKey);
      cleanup();
    };
  }, []);

  if (!loading) {
    return null;
  }

  return <aha-spinner size='3ex' />;
};

export default SmartSpinner;
