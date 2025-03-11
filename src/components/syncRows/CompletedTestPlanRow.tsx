import React from 'react';
import { IDENTIFIER } from '../../extension';
import { syncCompletedPlans } from '../../lib/sync/syncPlans';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setLastSync,
  setSyncing,
}) => {
  try {
    setSyncing(true);

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const now = Date.now();

    await syncCompletedPlans({
      domain,
      projectIds,
    });
    setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const CompletedTestPlanRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Test plans (complete)'
      tooltip='Syncs the last 250 completed test plans (per project) from TestRail.'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingCompletedPlans'
      lastSyncKey='lastCompletedPlanSync'
    />
  );
};

export default CompletedTestPlanRow;
