import React from 'react';
import syncStatuses from '../../lib/sync/syncStatuses';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setSyncing,
  setLastSync,
}) => {
  try {
    setSyncing(true);
    const now = Date.now();

    await syncStatuses({ domain });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const StatusRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Statuses'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingStatuses'
      lastSyncKey='lastStatusSync'
    />
  );
};

export default StatusRow;
