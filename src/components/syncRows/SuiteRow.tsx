import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncSuites from '../../lib/sync/syncSuites';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setSyncing,
  setLastSync,
}) => {
  try {
    setSyncing(true);

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const now = Date.now();

    await syncSuites({
      domain,
      projectIds,
    });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const SuiteRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Test suites'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingSuites'
      lastSyncKey='lastSuiteSync'
    />
  );
};

export default SuiteRow;
