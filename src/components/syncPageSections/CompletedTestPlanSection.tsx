import React from 'react';
import { IDENTIFIER } from '../../extension';
import { syncCompletedPlans } from '../../lib/sync/syncPlans';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setLoading,
  setLastSync,
  setSyncing,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);
    setMessage('Fetching projects for test plans...');

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const now = Date.now();

    await syncCompletedPlans({
      domain,
      projectIds,
      logger: setMessage,
    });
    setLastSync(now);
  } catch (error) {
    setMessage(null);
    setError(error.message);
  } finally {
    setLoading(false);
    setSyncing(false);
  }
};

const CompletedTestPlanSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync completed test plans'
      resync={resync}
      domain={domain}
      disabled={disabled}
      setDisabled={setDisabled}
      syncKey={'lastCompletedPlanSync'}
    />
  );
};

export default CompletedTestPlanSection;
