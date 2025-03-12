import React from 'react';
import syncResults from '../../lib/sync/syncResults';
import { getAllRunIds } from '../../lib/extensionFields/queries';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  lastSync,
  setSyncing,
  setLastSync,
}) => {
  try {
    setSyncing(true);

    const runIds = await getAllRunIds();
    const now = Date.now();

    await syncResults({
      domain,
      runIds,
      lastResultSync: lastSync,
    });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const TestResultRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Test comments'
      resync={resync}
      domain={domain}
      disabled={disabled}
      canSyncLatest={true}
      syncKey='syncingResults'
      lastSyncKey='lastResultSync'
    />
  );
};

export default TestResultRow;
