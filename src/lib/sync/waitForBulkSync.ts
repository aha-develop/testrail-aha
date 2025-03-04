import { sleep } from '../util';
import bulkSync, { BulkSyncState, SyncState } from './bulkSync';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';

const SLEEP_INTERVAL = 1 * 1000;
const TIMEOUT_SLEEP_INTERVAL = 5 * 1000; // Check less often if just checking for timeout

type WaitProps = {
  setState: (state: BulkSyncState) => void;
  domain: string;
  syncDelay: number;
  reload: () => void;
};

const waitForBulkSync: (props: WaitProps) => Promise<void> = async ({
  setState,
  syncDelay,
  domain,
  reload,
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
  bulkSync({ domain, syncDelay, updateState, setShouldWait });

  while (!state || state.state === SyncState.Running) {
    const interval = shouldWait ? SLEEP_INTERVAL : TIMEOUT_SLEEP_INTERVAL;

    await sleep(interval);

    const keys = ['retryAt'];

    // Only fetch state if it's not running locally and the initial state has been set
    if (shouldWait && state) {
      keys.push('bulkSyncState');
    }

    const values = await getAccountExtensionFieldMap(keys);

    if (shouldWait && state && values['bulkSyncState']) {
      state = values['bulkSyncState'];
      setState(state);
    }

    const retryAt = values['retryAt'] as number | undefined;

    if (retryAt && retryAt > Date.now()) {
      setState({ ...state, state: SyncState.Timeout });
      await sleep(retryAt - Date.now());
    }
  }

  if (state.state === SyncState.Success) {
    reload();
  }
};

export default waitForBulkSync;
