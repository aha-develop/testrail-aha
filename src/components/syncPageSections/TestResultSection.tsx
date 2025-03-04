import React from 'react';
import syncResults from '../../lib/sync/syncResults';
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
    setMessage('Fetching test runs for test results...');

    const runIds = await getAllRunIds();
    const now = Date.now();

    await syncResults({
      domain,
      logger: setMessage,
      runIds,
      lastResultSync: lastSync,
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

const TestResultSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync test results'
      resync={resync}
      domain={domain}
      disabled={disabled}
      hasToggle={true}
      setDisabled={setDisabled}
      syncKey={'lastResultSync'}
    />
  );
};

export default TestResultSection;
