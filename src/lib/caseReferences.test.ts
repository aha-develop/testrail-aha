import { IDENTIFIER } from '../extension';
import { fetchTestRail, logResult } from './api';
import { syncCaseReference } from './caseReferences';

jest.mock('./api', () => ({
  fetchTestRail: jest.fn(),
  logResult: jest.fn(),
}));

const mockFetch = fetchTestRail as jest.Mock;
const mockLog = logResult as jest.Mock;
const getSetting = jest.fn();
const record = {} as Aha.Account;
const args = {
  record,
  eventKey: 'reference-result',
  caseId: 12,
  reference: 'ABC-1',
  operation: 'add' as const,
};

beforeEach(() => {
  jest.resetAllMocks();
  (global as any).aha = { settings: { get: getSetting } };
  getSetting.mockReturnValue(true);
  mockFetch.mockResolvedValue({ id: 12, refs: null });
});

it.each([false, undefined, 'true'])('does no API work when setting is %p', async setting => {
  getSetting.mockReturnValue(setting);
  await syncCaseReference(args);
  expect(getSetting).toHaveBeenCalledWith(`${IDENTIFIER}.syncCaseReferences`);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ error: false }));
});

it.each([
  [null, 'ABC-1'],
  ['', 'ABC-1'],
  ['   ', 'ABC-1'],
  ['ABC-10, OTHER-2', 'ABC-10, OTHER-2, ABC-1'],
  [' X-1 , Y-2 ', ' X-1 , Y-2 , ABC-1'],
])('adds a whole reference to %p while preserving other references', async (refs, expected) => {
  mockFetch.mockResolvedValueOnce({ refs });
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenNthCalledWith(1, {
    record, eventKey: args.eventKey, path: 'get_case/12',
  });
  expect(mockFetch).toHaveBeenNthCalledWith(2, {
    record, eventKey: args.eventKey, path: 'update_case/12',
    method: 'POST', body: { refs: expected },
  });
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
    error: false, result: { changed: true },
  }));
});

it.each(['ABC-1', ' OTHER-2, ABC-1 ', 'ABC-1, ABC-1'])('does not duplicate %p', async refs => {
  mockFetch.mockResolvedValueOnce({ refs });
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
    error: false, result: { changed: false },
  }));
});

it.each([
  ['ABC-1', ''],
  [' ABC-1 , , ABC-1 ', ''],
  ['ABC-10, ABC-1, OTHER-2', 'ABC-10, OTHER-2'],
  ['ABC-1, OTHER-2, ABC-1', ' OTHER-2'],
])('removes only exact matches from %p, including duplicates', async (refs, expected) => {
  mockFetch.mockResolvedValueOnce({ refs });
  await syncCaseReference({ ...args, operation: 'remove' });
  expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({
    method: 'POST', body: { refs: expected },
  }));
});

it.each([null, '', 'ABC-10, OTHER-2'])('does not write if removal is already satisfied: %p', async refs => {
  mockFetch.mockResolvedValueOnce({ refs });
  await syncCaseReference({ ...args, operation: 'remove' });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each([
  { caseId: 0 }, { caseId: -1 }, { caseId: 1.5 },
  { caseId: '12&other=1' }, { reference: '' }, { reference: '  ' },
  { reference: 'ABC-1,ABC-2' }, { reference: 'ABC-1\n' },
  { operation: 'replace' },
])('rejects invalid arguments %p', async invalid => {
  await syncCaseReference({ ...args, ...invalid } as any);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ error: true }));
});

it('does not replace references if the GET response is malformed', async () => {
  mockFetch.mockResolvedValueOnce({});
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ error: true }));
});

it('preserves errors already reported by a failed GET', async () => {
  mockFetch.mockResolvedValueOnce(null);
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockLog).not.toHaveBeenCalled();
});

it('preserves POST errors and re-reads references on retry', async () => {
  mockFetch.mockResolvedValueOnce({ refs: 'OTHER-1' }).mockResolvedValueOnce(null);
  await syncCaseReference(args);
  expect(mockLog).not.toHaveBeenCalled();

  mockFetch.mockResolvedValueOnce({ refs: 'OTHER-1, NEW-2' });
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenNthCalledWith(3, expect.objectContaining({ path: 'get_case/12' }));
  expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({
    body: { refs: 'OTHER-1, NEW-2, ABC-1' },
  }));
});

it('can retry after a write succeeded but its response was lost', async () => {
  mockFetch.mockResolvedValueOnce({ refs: null }).mockRejectedValueOnce(new Error('Connection lost'));
  await syncCaseReference(args);
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ error: true }));

  mockFetch.mockResolvedValueOnce({ refs: 'ABC-1' });
  await syncCaseReference(args);
  expect(mockFetch).toHaveBeenCalledTimes(3);
  expect(mockLog).toHaveBeenLastCalledWith(expect.objectContaining({ error: false }));
});
