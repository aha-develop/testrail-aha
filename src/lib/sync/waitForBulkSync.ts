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
  start?: boolean;
  getLatest?: boolean;
};

const waitForBulkSync: (props: WaitProps) => Promise<void> = async ({
  setState,
  syncDelay,
  domain,
  reload,
  type = SyncType.All,
  start = true,
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

  // Kick off a bulk sync if not already running
  if (start) {
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
    if (shouldWait && (state || !start)) {
      keys.push(syncKey);
    }

    const values = await getAccountExtensionFieldMap(keys);

    // Sync hasn't started - no reason to wait
    if (!start && !values[syncKey]) {
      return;
    }

    if (shouldWait && (state || !start) && values[syncKey]) {
      state = values[syncKey];
      setState(state);
    }

    const retryAt = values['retryAt'] as number | undefined;

    if (start && retryAt && retryAt > Date.now()) {
      setState({ ...state, state: SyncState.Timeout });
      await sleep(retryAt - Date.now());
    }
  }

  if (state.state === SyncState.Complete && reload) {
    reload();
  }
};

export default waitForBulkSync;
