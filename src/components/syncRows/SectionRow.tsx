import React from 'react';
import { IDENTIFIER } from '../../extension';
import syncSections from '../../lib/sync/syncSections';
import { getProjectSuiteMapping } from '../../lib/extensionFields/queries';
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

    await syncSections({
      domain,
      projectSuites,
      ignoredSuiteIds: ignoredSuites,
    });

    await setLastSync(now);
  } catch (error) {
    showError(error.message);
    throw error;
  } finally {
    setSyncing(false);
  }
};

const SectionRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Sections'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingSections'
      lastSyncKey='lastSectionSync'
    />
  );
};

export default SectionRow;
