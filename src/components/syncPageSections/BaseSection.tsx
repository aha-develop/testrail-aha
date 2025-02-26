import React, { useState, useEffect } from 'react';
import { IDENTIFIER } from '../../extension';
import { timeAgo } from '../../lib/util';

export type SectionProps = {
  domain: string;
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
};

export type ResyncProps = {
  domain: string;
  lastSync?: number | null;
  setSyncing: (syncing: boolean) => void;
  setLoading: (loading: boolean) => void;
  setLastSync: (lastSync: number) => void;
  setMessage: (message: string | null) => void;
  setError: (error: string | null) => void;
};

type BaseSectionProps = SectionProps & {
  syncKey: string;
  hasToggle?: boolean;
  title: string;
  resync: (props: ResyncProps) => Promise<void>;
};

const BaseSection: React.FC<BaseSectionProps> = ({
  domain,
  disabled,
  setDisabled,
  hasToggle = false,
  syncKey,
  title,
  resync,
}) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncAll, setSyncAll] = useState(false);

  // Make sure if state update is slow, we don't use stale values
  let cachedLastSync = lastSync;
  let cachedSyncAll = syncAll;

  const setSyncState = (syncing: boolean) => {
    setDisabled(syncing);
    setSyncing(syncing);
  };

  useEffect(() => {
    const initLastSynced = async () => {
      const actualLastSync = (await aha.account.getExtensionField(
        IDENTIFIER,
        syncKey
      )) as number | undefined;

      if (actualLastSync) {
        setLastSync(actualLastSync);
        cachedLastSync = actualLastSync;
      } else if (hasToggle) {
        cachedSyncAll = true;
        setSyncAll(true);
      }

      setLoading(false);
    };

    initLastSynced();
  }, []);

  const clickHandler = () => {
    setMessage(null);
    setError(null);

    resync({
      domain,
      setLoading,
      setSyncing: setSyncState,
      setMessage,
      setError,
      setLastSync,
      lastSync: cachedSyncAll ? null : cachedLastSync,
    });
  };

  return (
    <section>
      <h2>{title}</h2>

      <div className='subsection'>
        {hasToggle && (
          <aha-radio-button-group>
            <aha-radio-button
              selected={!cachedSyncAll}
              disabled={cachedLastSync ? null : true}
              prevent-click={cachedLastSync ? null : true}
              onClick={() => {
                if (cachedLastSync) {
                  cachedSyncAll = false;
                  setSyncAll(false);
                }
              }}
            >
              Sync latest
            </aha-radio-button>
            <aha-radio-button
              selected={cachedSyncAll}
              onClick={() => {
                setSyncAll(true);
                cachedSyncAll = true;
              }}
            >
              Sync all
            </aha-radio-button>
          </aha-radio-button-group>
        )}
        <aha-button
          kind={cachedSyncAll ? 'danger' : 'primary'}
          onClick={clickHandler}
          disabled={syncing || disabled || loading ? true : null}
        >
          {loading
            ? 'Loading...'
            : syncing
            ? 'Syncing...'
            : disabled
            ? 'Waiting...'
            : 'Sync now'}
        </aha-button>
        {cachedLastSync && (
          <div className='text-small text-gray'>
            Last synced: {timeAgo(cachedLastSync)}
          </div>
        )}
        {syncing && <aha-spinner />}
        <div>
          {message && <span className='text-small text-gray'>{message}</span>}
          {error && <span className='text-small text-error'>{error}</span>}
        </div>
      </div>
    </section>
  );
};

export default BaseSection;
