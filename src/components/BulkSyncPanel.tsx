import React, { useState, useEffect } from 'react';
import { SyncType, BulkSyncState, SyncState } from '../lib/sync/bulkSync';
import waitForBulkSync from '../lib/sync/waitForBulkSync';
import { timeAgo, showSyncWarning } from '../lib/util';
import SyncProgress from './SyncProgress';

type Props = {
  domain: string;
  type: SyncType;
  title: string;
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
};

const BulkSyncPanel: React.FC<Props> = ({
  domain,
  type,
  title,
  disabled,
  setDisabled,
  children,
}) => {
  const [state, setState] = useState<BulkSyncState | null>(null);
  const [syncing, setSyncing] = useState(false);

  const updateState = (state: BulkSyncState) => {
    if (
      state.state === SyncState.Running ||
      state.state === SyncState.Timeout
    ) {
      setDisabled(true);
      setSyncing(true);
    } else {
      setDisabled(false);
      setSyncing(false);
    }

    setState(state);
  };

  useEffect(() => {
    waitForBulkSync({
      domain,
      type,
      syncDelay: -1,
      setState: updateState,
    });
  }, []);

  const bulkSync = () => {
    showSyncWarning();
    waitForBulkSync({
      domain,
      type,
      syncDelay: 0,
      setState: updateState,
      getLatest: false, // Will get records prior to the latest sync
    });
  };

  return (
    <div className='sync-panel'>
      <div className='sync-panel-header'>
        <div className='h-600'>{title}</div>
        <div>
          <aha-button
            kind='link'
            onClick={bulkSync}
            disabled={disabled ? true : null}
          >
            {syncing ? 'Syncing' : disabled ? 'Waiting' : 'Sync all'}
          </aha-button>
        </div>
      </div>
      <div className='sync-panel-content'>
        <div className='sync-panel-bulk'>
          {children}
          <div>
            <span className='text-strong'>Latest sync:</span>
            <span className='ml-1'>{timeAgo(state?.lastSync)}</span>
          </div>
          {syncing && <SyncProgress syncData={state} />}
        </div>
      </div>
    </div>
  );
};

export default BulkSyncPanel;
