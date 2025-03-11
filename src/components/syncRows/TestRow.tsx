import React from 'react';
import syncTests from '../../lib/sync/syncTests';
import { getAllRunIds } from '../../lib/extensionFields/queries';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setSyncing,
  setLastSync,
}) => {
  try {
    setSyncing(true);

    const runIds = await getAllRunIds();
    const now = Date.now();

    await syncTests({
      domain,
      runIds,
    });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const TestRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Tests'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingTests'
      lastSyncKey={'lastTestSync'}
    />
  );
};

export default TestRow;
