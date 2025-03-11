import React from 'react';
import { IDENTIFIER } from '../../extension';
import { syncCompletedRuns } from '../../lib/sync/syncRuns';
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

    await syncCompletedRuns({
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

const CompletedTestRunRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Test runs (complete)'
      tooltip='Syncs the last 250 completed test runs (per project) from TestRail.'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingCompletedRuns'
      lastSyncKey='lastCompletedRunSync'
    />
  );
};

export default CompletedTestRunRow;
