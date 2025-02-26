import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncSuites from '../../lib/sync/syncSuites';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setLoading,
  setSyncing,
  setLastSync,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);

    setMessage('Fetching projects for suites...');

    const projectIds =
      (await aha.account.getExtensionField<string[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    if (projectIds.length === 0) {
      setMessage('No projects found, aborting sync.');
      return;
    }

    const now = Date.now();

    await syncSuites({
      domain,
      logger: setMessage,
      projectIds,
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

const SuiteSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync suites'
      resync={resync}
      domain={domain}
      disabled={disabled}
      setDisabled={setDisabled}
      syncKey={'lastSuiteSync'}
    />
  );
};

export default SuiteSection;
