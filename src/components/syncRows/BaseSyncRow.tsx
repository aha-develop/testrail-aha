import React, { useState, useEffect, useCallback } from 'react';
import { IDENTIFIER } from '../../extension';
import { timeAgo, sleep, showSyncWarning } from '../../lib/util';
import { getAccountExtensionFieldMap } from '../../lib/extensionFields/queries';

export type RowProps = {
  domain: string;
  disabled: boolean;
};

export type ResyncProps = {
  domain: string;
  lastSync?: number | null;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (lastSync: number) => void;
};

type BaseRowProps = RowProps & {
  syncKey: string;
  lastSyncKey: string;
  canSyncLatest?: boolean;
  recordType: string;
  resync: (props: ResyncProps) => Promise<void>;
  tooltip?: string;
};

type ButtonProps = {
  canSyncLatest?: boolean;
  loading: boolean;
  disabled: boolean;
  syncing: boolean;
  clickHandler: (shouldLastSync: boolean) => () => void;
};

const SLEEP_INTERVAL = 1 * 1000;
const MAX_WAIT_TIME = 30 * 60 * 1000;

export const waitForSync: (
  syncKey: string,
  lastSyncKey: string
) => Promise<number> = async (syncKey, lastSyncKey) => {
  let currentlySyncing = await aha.account.getExtensionField<boolean>(
    IDENTIFIER,
    syncKey
  );
  const keys = [syncKey, lastSyncKey];

  while (currentlySyncing) {
    await sleep(SLEEP_INTERVAL);

    const map = await getAccountExtensionFieldMap(keys);

    if (!map[syncKey]) {
      return map[lastSyncKey] as number;
    }
  }
};

const SyncButtons: React.FC<ButtonProps> = ({
  canSyncLatest,
  loading,
  disabled,
  syncing,
  clickHandler,
}) => {
  return (
    <>
      <aha-button
        kind='link'
        onClick={clickHandler(false)}
        disabled={disabled || loading || syncing ? true : null}
      >
        {loading
          ? 'Loading...'
          : syncing
          ? 'Syncing...'
          : disabled
          ? 'Waiting...'
          : 'Sync all'}
      </aha-button>
      {canSyncLatest && (
        <aha-button
          kind='secondary'
          onClick={clickHandler(true)}
          disabled={syncing || loading || disabled ? true : null}
          style={{ width: '160px' }}
        >
          <span>
            {syncing
              ? 'Updating...'
              : disabled
              ? 'Waiting...'
              : 'Check for updates'}
            <aha-icon class='ml-1' icon='fa-solid fa-rotate' />
          </span>
        </aha-button>
      )}
    </>
  );
};

const BaseSyncRow: React.FC<BaseRowProps> = ({
  domain,
  disabled,
  canSyncLatest = false,
  syncKey,
  lastSyncKey,
  recordType,
  tooltip,
  resync,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  const setSyncState = async (syncing: boolean) => {
    setSyncing(syncing);
    await aha.account.setExtensionField(IDENTIFIER, syncKey, syncing);
  };

  useEffect(() => {
    const initSync = async () => {
      const keys = [syncKey, lastSyncKey];
      const map = await getAccountExtensionFieldMap(keys);

      const actualLastSync = map[lastSyncKey] as number | undefined;
      let currentlySyncing = map[syncKey] as boolean | undefined;

      if (actualLastSync) {
        setLastSync(actualLastSync);
      }

      setLoading(false);

      // Make sure the sync state can't get stuck
      if (
        currentlySyncing &&
        actualLastSync &&
        actualLastSync + MAX_WAIT_TIME < Date.now()
      ) {
        currentlySyncing = false;
      }

      setSyncing(currentlySyncing);
      const newLastSync = await waitForSync(syncKey, lastSyncKey);
      setSyncing(false);

      if (newLastSync && newLastSync !== map[lastSyncKey]) {
        setLastSync(newLastSync);
      }
    };

    initSync();
  }, []);

  const clickHandler = useCallback(
    shouldLastSync => async () => {
      const currentlySyncing = await aha.account.getExtensionField<boolean>(
        IDENTIFIER,
        syncKey
      );

      showSyncWarning();

      if (currentlySyncing) {
        setSyncing(true);
        const newLastSync = await waitForSync(syncKey, lastSyncKey);
        setLastSync(newLastSync);
        setSyncing(false);
      } else {
        setSyncing(true);
        await aha.account.setExtensionField(IDENTIFIER, syncKey, true);

        const failSync = async () => {
          await aha.account.setExtensionField(IDENTIFIER, syncKey, false);
        };

        // If this doesn't fire, we still have the max wait time as a fallback
        window.addEventListener('beforeunload', failSync);

        await resync({
          domain,
          setSyncing: setSyncState,
          setLastSync,
          lastSync: shouldLastSync && lastSync ? lastSync : null,
        });

        await failSync();
        window.removeEventListener('beforeunload', failSync);
      }
    },
    [lastSync]
  );

  return (
    <div className='sync-panel-row'>
      <div className='sync-panel-column'>
        <span>
          {recordType}
          {tooltip && (
            <span className='ml-1'>
              <aha-tooltip-default-trigger></aha-tooltip-default-trigger>
              <aha-tooltip placement='top'>
                <span>{tooltip}</span>
              </aha-tooltip>
            </span>
          )}
        </span>
      </div>
      <div className='sync-panel-column'>
        <span className='sync-time-ago'>{timeAgo(lastSync)}</span>
        <SyncButtons
          canSyncLatest={canSyncLatest}
          loading={loading}
          disabled={disabled}
          syncing={syncing}
          clickHandler={clickHandler}
        />
      </div>
    </div>
  );
};

export default BaseSyncRow;
