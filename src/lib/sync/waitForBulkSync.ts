import { sleep } from '../util';
import bulkSync, {
  getSyncKey,
  BulkSyncState,
  SyncState,
  SyncType,
} from './bulkSync';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';

const SLEEP_INTERVAL = 1 * 1000;
const TIMEOUT_SLEEP_INTERVAL = 5 * 1000; // Check less often if just checking for timeout

type WaitProps = {
  setState: (state: BulkSyncState) => void;
  domain: string;
  syncDelay: number;
  reload?: () => void;
  type?: SyncType;
  getLatest?: boolean;
};

const waitForBulkSync: (props: WaitProps) => Promise<void> = async ({
  setState,
  syncDelay,
  domain,
  reload,
  type = SyncType.All,
  getLatest = true,
}) => {
  let state;
  let shouldWait = true;

  const updateState = (newState: BulkSyncState) => {
    state = newState;
    setState(state);
  };

  const setShouldWait = (newShouldWait: boolean) => {
    shouldWait = newShouldWait;
  };

  // Kick off a bulk sync if not already running.
  // Skips if syncDelay is negative (no auto-sync allowed)
  if (syncDelay >= 0) {
    bulkSync({
      domain,
      type,
      syncDelay,
      getLatest,
      updateState,
      setShouldWait,
    });
  }

  while (!state || state.state === SyncState.Running) {
    const interval = shouldWait ? SLEEP_INTERVAL : TIMEOUT_SLEEP_INTERVAL;

    await sleep(interval);

    const keys = ['retryAt'];

    const syncKey = getSyncKey(type);

    // Only fetch state if it's not running locally and the initial state has been set
    if (shouldWait && (state || syncDelay < 0)) {
      keys.push(syncKey);
    }

    const values = await getAccountExtensionFieldMap(keys);

    // Sync hasn't started - no reason to wait
    if (syncDelay < 0 && !values[syncKey]) {
      return;
    }

    if (shouldWait && (state || syncDelay < 0) && values[syncKey]) {
      state = values[syncKey];
      setState(state);
    }

    const retryAt = values['retryAt'] as number | undefined;

    if (syncDelay >= 0 && retryAt && retryAt > Date.now()) {
      setState({ ...state, state: SyncState.Timeout });
      await sleep(retryAt - Date.now());
    }
  }

  if (state.state === SyncState.Complete && reload) {
    reload();
  }
};

export default waitForBulkSync;
