import { normalizeDomain } from './api';

describe('normalizeDomain', () => {
  it('strips https:// protocol and .testrail.io suffix', () => {
    expect(normalizeDomain('https://myteam.testrail.io')).toBe('myteam');
  });

  it('strips http:// protocol', () => {
    expect(normalizeDomain('http://myteam.testrail.io')).toBe('myteam');
  });

  it('handles trailing slash', () => {
    expect(normalizeDomain('https://myteam.testrail.io/')).toBe('myteam');
  });

  it('strips .testrail.io without protocol', () => {
    expect(normalizeDomain('myteam.testrail.io')).toBe('myteam');
  });

  it('returns plain subdomain unchanged', () => {
    expect(normalizeDomain('myteam')).toBe('myteam');
  });

  it('trims whitespace', () => {
    expect(normalizeDomain('  myteam  ')).toBe('myteam');
  });

  it('handles capitalization', () => {
    expect(normalizeDomain('HTTPS://MYTEAM.TESTRAIL.IO')).toBe('myteam');
  });
});
