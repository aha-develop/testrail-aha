import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncCases from '../../lib/sync/syncCases';
import { getProjectSuiteMapping } from '../../lib/extensionFields/queries';
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

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const ignoredSuites =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'ignoredSuites'
      )) ?? [];

    const projectSuites = await getProjectSuiteMapping(
      projectIds,
      ignoredSuites
    );
    const now = Date.now();

    await syncCases({
      domain,
      projectSuites,
      lastCaseSync: lastSync,
      ignoredSuiteIds: ignoredSuites,
    });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const TestCaseRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Test cases'
      resync={resync}
      domain={domain}
      disabled={disabled}
      canSyncLatest={true}
      syncKey='syncingCases'
      lastSyncKey='lastCaseSync'
    />
  );
};

export default TestCaseRow;
