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
      } else if (hasToggle) {
        setSyncAll(true);
      }

      setLoading(false);
    };

    initLastSynced();
  }, []);

  return (
    <section>
      <h2>{title}</h2>

      <div className='subsection'>
        {hasToggle && (
          <aha-radio-button-group>
            <aha-radio-button
              selected={!syncAll}
              disabled={lastSync ? null : true}
              prevent-click={lastSync ? null : true}
              onClick={() => {
                if (lastSync) setSyncAll(false);
              }}
            >
              Sync latest
            </aha-radio-button>
            <aha-radio-button
              selected={syncAll}
              onClick={() => setSyncAll(true)}
            >
              Sync all
            </aha-radio-button>
          </aha-radio-button-group>
        )}
        <aha-button
          kind={syncAll ? 'danger' : 'primary'}
          onClick={() =>
            resync({
              domain,
              setLoading,
              setSyncing: setSyncState,
              setMessage,
              setError,
              setLastSync,
              lastSync: syncAll ? null : lastSync,
            })
          }
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
        {lastSync && (
          <div className='text-small text-light'>
            Last synced: {timeAgo(lastSync)}
          </div>
        )}
        {syncing && <aha-spinner />}
        <div>
          {message && <span className='text-small text-light'>{message}</span>}
          {error && <span className='text-small error'>{error}</span>}
        </div>
      </div>
    </section>
  );
};

export default BaseSection;
