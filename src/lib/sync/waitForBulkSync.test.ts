import { sleep } from '../util';
import bulkSync, { SyncState, SyncType } from './bulkSync';
import { getAccountExtensionFieldMap } from '../extensionFields/queries';
import waitForBulkSync from './waitForBulkSync';

jest.mock('../util', () => ({
  sleep: jest.fn(),
}));

jest.mock('./bulkSync', () => ({
  ...jest.requireActual('./bulkSync'),
  default: jest.fn(({ updateState }) => {
    updateState({ state: SyncState.Running });
  }),
  getSyncKey: jest.fn(() => 'syncKey'),
}));

jest.mock('../extensionFields/queries', () => ({
  getAccountExtensionFieldMap: jest.fn(),
}));

const mockBulkSync = bulkSync as jest.Mock;
const mockSleep = sleep as jest.Mock;
const mockGetAccountExtensionFieldMap =
  getAccountExtensionFieldMap as jest.Mock;

describe('waitForBulkSync', () => {
  const mockSetState = jest.fn();
  const mockReload = jest.fn();

  const defaultProps = {
    setState: mockSetState,
    domain: 'test-domain',
    syncDelay: 1000,
    reload: mockReload,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a new sync when start=true', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({});
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      syncKey: { state: SyncState.Complete },
    });

    await waitForBulkSync({ ...defaultProps });

    expect(bulkSync).toHaveBeenCalledWith({
      domain: 'test-domain',
      type: SyncType.All,
      syncDelay: 1000,
      getLatest: true,
      updateState: expect.any(Function),
      setShouldWait: expect.any(Function),
    });
  });

  it('does not start sync when start=false', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      syncKey: { state: SyncState.Complete },
    });

    await waitForBulkSync({ ...defaultProps, start: false });

    expect(bulkSync).not.toHaveBeenCalled();
  });

  it('returns early if no sync is running and start=false', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      retryAt: undefined,
    });

    await waitForBulkSync({ ...defaultProps, start: false });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('waits while sync is running', async () => {
    mockGetAccountExtensionFieldMap
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        syncKey: { state: SyncState.Running },
      })
      .mockResolvedValueOnce({
        syncKey: { state: SyncState.Complete },
      });

    await waitForBulkSync(defaultProps);

    expect(sleep).toHaveBeenCalledTimes(3);
    expect(mockSetState).toHaveBeenCalledWith({ state: SyncState.Complete });
  });

  it('calls reload when sync completes', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      syncKey: { state: SyncState.Complete },
    });

    await waitForBulkSync(defaultProps);

    expect(mockReload).toHaveBeenCalled();
  });

  it('handles timeout state', async () => {
    const futureTime = Date.now() + 10000;

    mockGetAccountExtensionFieldMap
      .mockResolvedValueOnce({
        retryAt: futureTime,
        syncKey: { state: SyncState.Running },
      })
      .mockResolvedValueOnce({
        syncKey: { state: SyncState.Complete },
      });

    await waitForBulkSync(defaultProps);

    expect(mockSetState).toHaveBeenCalledWith({ state: SyncState.Timeout });
    expect(mockSleep.mock.calls[1][0]).toBeGreaterThan(5000);
  });

  it('respects custom sync type', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      syncKey: { state: SyncState.Complete },
    });

    await waitForBulkSync({
      ...defaultProps,
      type: SyncType.Cases,
    });

    expect(bulkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncType.Cases,
      })
    );
  });

  it('respects getLatest option', async () => {
    mockGetAccountExtensionFieldMap.mockResolvedValueOnce({
      syncKey: { state: SyncState.Complete },
    });

    await waitForBulkSync({
      ...defaultProps,
      getLatest: false,
    });

    expect(bulkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        getLatest: false,
      })
    );
  });
});
