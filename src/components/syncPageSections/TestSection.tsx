import React from 'react';
import syncTests from '../../lib/sync/syncTests';
import { getAllRunIds } from '../../lib/extensionFields/queries';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  lastSync,
  setLoading,
  setSyncing,
  setLastSync,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);
    setMessage('Fetching test runs for tests...');

    const runIds = await getAllRunIds();
    const now = Date.now();

    await syncTests({
      domain,
      logger: setMessage,
      runIds,
      lastTestSync: lastSync,
    });
    await setLastSync(now);
  } catch (error) {
    setMessage(null);
    setError(error.message);
  } finally {
    setLoading(false);
    setSyncing(false);
  }
};

const TestSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync tests'
      resync={resync}
      domain={domain}
      disabled={disabled}
      hasToggle={true}
      setDisabled={setDisabled}
      syncKey={'lastTestSync'}
    />
  );
};

export default TestSection;
