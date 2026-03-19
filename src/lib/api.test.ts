import { normalizeSubdomain } from './api';

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
