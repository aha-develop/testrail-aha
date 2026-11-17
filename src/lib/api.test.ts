import { fetchTestRail, normalizeSubdomain, TIMEOUT_MESSAGE } from './api';
import { IDENTIFIER } from '../extension';

// Match the default-import interop supplied by the extension bundler.
jest.mock('base64-js', () => ({
  __esModule: true,
  default: jest.requireActual('base64-js'),
}));

describe('normalizeSubdomain', () => {
  it('strips https:// protocol and .testrail.io suffix', () => {
    expect(normalizeSubdomain('https://myteam.testrail.io')).toBe('myteam');
  });

  it('strips http:// protocol', () => {
    expect(normalizeSubdomain('http://myteam.testrail.io')).toBe('myteam');
  });

  it('handles trailing characters', () => {
    expect(normalizeSubdomain('https://myteam.testrail.io/index.php')).toBe('myteam');
  });

  it('strips .testrail.io without protocol', () => {
    expect(normalizeSubdomain('myteam.testrail.io')).toBe('myteam');
  });

  it('returns plain subdomain unchanged', () => {
    expect(normalizeSubdomain('myteam')).toBe('myteam');
  });

  it('trims whitespace', () => {
    expect(normalizeSubdomain('  myteam  ')).toBe('myteam');
  });

  it('handles capitalization', () => {
    expect(normalizeSubdomain('HTTPS://MYTEAM.TESTRAIL.IO')).toBe('myteam');
  });
});

describe('fetchTestRail cooldown', () => {
  const mockFetch = jest.fn();
  const getExtensionField = jest.fn();
  const setExtensionField = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers({ now: 1000000 });
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = mockFetch;
    (global as any).aha = {
      settings: { get: () => 'test' },
      account: { getExtensionField, setExtensionField },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const request = () => fetchTestRail({
    domain: 'test', path: 'get_projects', record: aha.account, eventKey: 'sync',
  });

  it('leaves cooldown checks to the frontend without reading account fields', async () => {
    getExtensionField.mockResolvedValue(Date.now() + 120000);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ projects: [] }) });

    expect(await request()).toEqual({ projects: [] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getExtensionField).not.toHaveBeenCalled();
  });

  it.each(['120', null])('persists the deadline before reporting a 429 (Retry-After=%s)', async retryAfter => {
    mockFetch.mockResolvedValue({
      ok: false, status: 429, headers: { get: () => retryAfter },
    });
    let finishSaving: () => void;
    setExtensionField.mockImplementation(async (_identifier, key) => {
      if (key === 'retryAt') await new Promise<void>(resolve => { finishSaving = resolve; });
    });
    const pending = request();
    await jest.advanceTimersByTimeAsync(0);

    expect(setExtensionField).toHaveBeenCalledTimes(1);
    expect(setExtensionField).toHaveBeenCalledWith(
      IDENTIFIER, 'retryAt', 1000000 + (retryAfter ? 120000 : 60000)
    );
    finishSaving();
    expect(await pending).toBeNull();
    expect(setExtensionField).toHaveBeenLastCalledWith(IDENTIFIER, 'sync', {
      error: true, message: TIMEOUT_MESSAGE, result: undefined,
    });
  });
});
