import React from 'react';
import syncProjects from '../../lib/sync/syncProjects';
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

    await syncProjects({ domain });
    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const ProjectRow: React.FC<RowProps> = ({ domain, disabled }) => {
  return (
    <BaseSyncRow
      recordType='Projects'
      resync={resync}
      domain={domain}
      disabled={disabled}
      syncKey='syncingProjects'
      lastSyncKey='lastProjectSync'
    />
  );
};

export default ProjectRow;
