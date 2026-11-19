import { fetchTestRail, normalizeSubdomain, formatTimeoutMessage } from './api';
import { IDENTIFIER } from '../extension';

// Match the default-import interop supplied by the extension bundler.
jest.mock('base64-js', () => ({
  __esModule: true,
  default: jest.requireActual('base64-js'),
}));

const invalidDomains = [
  undefined,
  null,
  123,
  {},
  '',
  '   ',
  'example.invalid/',
  'https://example.invalid/',
  'myteam.testrail.io.example.invalid',
  'myteam.testrail.io@example.invalid',
  'user@myteam.testrail.io',
  'myteam.testrail.io:443',
  'myteam/path',
  'myteam?query',
  'myteam#fragment',
  'myteam\\example.invalid',
  'myteam.testrail.io\\@example.invalid',
  'myteam%2fexample.invalid',
  'myteam\n.testrail.io',
  'ftp://myteam.testrail.io',
  '-myteam',
  'myteam-',
  'my_team',
  'a'.repeat(64),
];

describe('normalizeSubdomain', () => {
  it.each(invalidDomains)('returns null for invalid domain %p', domain => {
    expect(normalizeSubdomain(domain)).toBeNull();
  });

  it('strips https:// protocol and .testrail.io suffix', () => {
    expect(normalizeSubdomain('https://myteam.testrail.io')).toBe('myteam');
  });

  it('strips http:// protocol', () => {
    expect(normalizeSubdomain('http://myteam.testrail.io')).toBe('myteam');
  });

  it('handles trailing characters', () => {
    expect(normalizeSubdomain('https://myteam.testrail.io/index.php')).toBe(
      'myteam'
    );
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

describe('fetchTestRail destination security', () => {
  const mockFetch = jest.fn();
  const getSetting = jest.fn();
  const setExtensionField = jest.fn();
  const originalFetch = global.fetch;
  let configuredDomain: unknown;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    configuredDomain = 'myteam';
    getSetting.mockImplementation(
      key =>
        ({
          [`${IDENTIFIER}.domain`]: configuredDomain,
          [`${IDENTIFIER}.username`]: 'test-user',
          [`${IDENTIFIER}.token`]: 'test-token',
        })[key]
    );
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 123 }) });
    (global as any).aha = {
      settings: { get: getSetting },
      account: { setExtensionField },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    'example.invalid/',
    'https://example.invalid/',
    'another-tenant',
    undefined,
  ])('uses the server setting instead of caller domain %s', async domain => {
    const body = { title: 'New case' };
    expect(
      await fetchTestRail({
        domain,
        path: 'add_case/1',
        method: 'POST',
        body,
        record: aha.account,
        eventKey: 'create',
      })
    ).toEqual({ id: 123 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, args] = mockFetch.mock.calls[0];
    expect(url).toBe('https://myteam.testrail.io/index.php?/api/v2/add_case/1');
    expect(args.headers.get('Authorization')).toBe(
      'Basic dGVzdC11c2VyOnRlc3QtdG9rZW4='
    );
    expect(args).toMatchObject({
      method: 'POST',
      body: JSON.stringify(body),
      redirect: 'error',
    });
  });

  it.each([
    ['my-team', 'my-team'],
    ['  MYTEAM  ', 'myteam'],
    ['myteam.testrail.io', 'myteam'],
    ['https://myteam.testrail.io/', 'myteam'],
    ['http://myteam.testrail.io/index.php?/dashboard', 'myteam'],
    ['HTTPS://MYTEAM.TESTRAIL.IO', 'myteam'],
    ['a', 'a'],
  ])('accepts configured domain %s', async (domain, subdomain) => {
    configuredDomain = domain;
    await fetchTestRail({ path: 'get_projects', record: aha.account });

    expect(mockFetch).toHaveBeenCalledWith(
      `https://${subdomain}.testrail.io/index.php?/api/v2/get_projects`,
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    );
  });

  it.each(invalidDomains)(
    'rejects invalid configured domain %p before reading credentials',
    async domain => {
      configuredDomain = domain;

      expect(
        await fetchTestRail({
          domain: 'valid-client-domain',
          path: 'get_projects',
          record: aha.account,
          eventKey: 'sync',
        })
      ).toBeNull();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(getSetting.mock.calls).toEqual([[`${IDENTIFIER}.domain`]]);
      expect(setExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'sync', {
        error: true,
        message:
          'Cannot connect to TestRail, configured subdomain is missing or invalid',
        result: undefined,
      });
    }
  );
});

describe('fetchTestRail cooldown', () => {
  const mockFetch = jest.fn();
  const getExtensionField = jest.fn();
  const setExtensionField = jest.fn();
  const setExtensionFields = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers({ now: 1000000 });
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = mockFetch;
    (global as any).aha = {
      settings: { get: () => 'test' },
      account: { getExtensionField, setExtensionField, setExtensionFields },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const request = () =>
    fetchTestRail({
      domain: 'test',
      path: 'get_projects',
      record: aha.account,
      eventKey: 'sync',
    });

  it('leaves cooldown checks to the frontend without reading account fields', async () => {
    getExtensionField.mockResolvedValue(Date.now() + 120000);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [] }),
    });

    expect(await request()).toEqual({ projects: [] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getExtensionField).not.toHaveBeenCalled();
  });

  it.each(['account', 'record'])(
    'starts both writes concurrently (%s finishes first)',
    async first => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => '120' },
      });

      const finish: { [key: string]: () => void } = {};

      setExtensionField.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finish.account = resolve;
          })
      );

      const record = {
        setExtensionField: jest.fn(
          () =>
            new Promise<void>(resolve => {
              finish.record = resolve;
            })
        ),
      };

      let completed = false;
      const pending = fetchTestRail({
        path: 'get_projects',
        record: record as any,
        eventKey: 'sync',
      }).then(result => {
        completed = true;
        return result;
      });

      await jest.advanceTimersByTimeAsync(0);

      expect(setExtensionField).toHaveBeenCalledWith(
        IDENTIFIER,
        'retryAt',
        1120000
      );

      expect(record.setExtensionField).toHaveBeenCalledWith(
        IDENTIFIER,
        'sync',
        {
          error: true,
          message: formatTimeoutMessage(1120000),
        }
      );

      expect(setExtensionFields).not.toHaveBeenCalled();

      finish[first]();
      await jest.advanceTimersByTimeAsync(0);
      expect(completed).toBe(false);

      finish[first === 'account' ? 'record' : 'account']();
      expect(await pending).toBeNull();
    }
  );
});
