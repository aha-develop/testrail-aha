import { IDENTIFIER, TestCase, TestResult, TestRun } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { getAccountExtensionFieldMap } from './queries';
import { syncCaseReferences } from '../sync/syncCaseReferences';
import {
  linkRecord,
  linkRecords,
  unlinkRecord,
  saveRecords,
  saveNewRuns,
  linkResultsToTests,
} from './updates';

const mockGetExtensionField = jest.fn();
const mockSetExtensionField = jest.fn();
const mockSetExtensionFields = jest.fn();

(global as any).aha = {
  account: {
    getExtensionField: mockGetExtensionField,
    setExtensionFields: mockSetExtensionFields,
  },
};

const mockRecord = {
  getExtensionField: mockGetExtensionField,
  setExtensionField: mockSetExtensionField,
} as unknown as ExtensionRecord;

jest.mock('./queryExtensionFields', () => ({
  default: jest.fn(),
}));

jest.mock('./queries', () => ({
  ...jest.requireActual('./queries'),
  getAccountExtensionFieldMap: jest.fn(),
}));

const mockGetExtensionMap = getAccountExtensionFieldMap as jest.Mock;

jest.mock('../sync/syncCaseReferences', () => ({ syncCaseReferences: jest.fn() }));
const mockSyncReferences = syncCaseReferences as jest.Mock;

describe('case link reference syncing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncReferences.mockReset().mockResolvedValue(undefined);
    mockGetExtensionField.mockResolvedValue([123]);
  });

  it('syncs only new cases, deduplicating the requested IDs', async () => {
    await linkRecords(mockRecord, [123, 456, 456], 'caseIds');
    expect(mockSyncReferences).toHaveBeenCalledWith(mockRecord, [456], 'add');
    expect(mockSetExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'caseIds', [123, 456]);
    expect(mockSyncReferences.mock.invocationCallOrder[0]).toBeLessThan(mockSetExtensionField.mock.invocationCallOrder[0]);
  });

  it('does no work when the case is already linked', async () => {
    await linkRecord(mockRecord, 123, 'caseIds');
    expect(mockSyncReferences).not.toHaveBeenCalled();
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('saves a new link without syncing a reference already handled during creation', async () => {
    await linkRecord(mockRecord, 456, 'caseIds', { referenceHandled: true });
    expect(mockSyncReferences).not.toHaveBeenCalled();
    expect(mockSetExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'caseIds', [123, 456]);
  });

  it('syncs references when creation did not confirm handling them', async () => {
    await linkRecord(mockRecord, 456, 'caseIds', { referenceHandled: false });
    expect(mockSyncReferences).toHaveBeenCalledWith(mockRecord, [456], 'add');
  });

  it('syncs the removal before unlinking', async () => {
    await unlinkRecord(mockRecord, 123, 'caseIds');
    expect(mockSyncReferences).toHaveBeenCalledWith(mockRecord, [123], 'remove');
    expect(mockSetExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'caseIds', []);
    expect(mockSyncReferences.mock.invocationCallOrder[0]).toBeLessThan(mockSetExtensionField.mock.invocationCallOrder[0]);
  });

  it.each([undefined, [], [456]])('does nothing for an absent case link: %p', async ids => {
    mockGetExtensionField.mockResolvedValue(ids);
    await unlinkRecord(mockRecord, 123, 'caseIds');
    expect(mockSyncReferences).not.toHaveBeenCalled();
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it.each(['runIds', 'testIds'])('never syncs references for %s', async key => {
    await linkRecord(mockRecord, 456, key);
    await unlinkRecord(mockRecord, 123, key);
    expect(mockSyncReferences).not.toHaveBeenCalled();
  });

  it('leaves a failed link retryable', async () => {
    mockSyncReferences.mockRejectedValueOnce(new Error('TestRail unavailable'));
    await expect(linkRecord(mockRecord, 456, 'caseIds')).rejects.toThrow('TestRail unavailable');
    expect(mockSetExtensionField).not.toHaveBeenCalled();
    await linkRecord(mockRecord, 456, 'caseIds');
    expect(mockSetExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'caseIds', [123, 456]);
  });

  it('leaves a failed unlink retryable', async () => {
    mockSyncReferences.mockRejectedValueOnce(new Error('TestRail unavailable'));
    await expect(unlinkRecord(mockRecord, 123, 'caseIds')).rejects.toThrow('TestRail unavailable');
    expect(mockSetExtensionField).not.toHaveBeenCalled();
    await unlinkRecord(mockRecord, 123, 'caseIds');
    expect(mockSetExtensionField).toHaveBeenCalledWith(IDENTIFIER, 'caseIds', []);
  });
});

describe('linkRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds new id to empty extension field', async () => {
    mockGetExtensionField.mockResolvedValue(null);

    await linkRecord(mockRecord, 123, 'test_key');

    expect(mockRecord.getExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'test_key'
    );
    expect(mockRecord.setExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'test_key',
      [123]
    );
  });

  it('adds new id to existing extension field', async () => {
    mockGetExtensionField.mockResolvedValue([456]);

    await linkRecord(mockRecord, 123, 'test_key');

    expect(mockRecord.setExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'test_key',
      [456, 123]
    );
  });

  it('does not add duplicate id', async () => {
    mockGetExtensionField.mockResolvedValue([123]);

    await linkRecord(mockRecord, 123, 'test_key');

    expect(mockRecord.setExtensionField).not.toHaveBeenCalled();
  });
});

describe('unlinkRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes id from extension field', async () => {
    mockGetExtensionField.mockResolvedValue([123, 456]);

    await unlinkRecord(mockRecord, 123, 'test_key');

    expect(mockRecord.setExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'test_key',
      [456]
    );
  });

  it('does not update if id is not present', async () => {
    mockGetExtensionField.mockResolvedValue([456]);

    await unlinkRecord(mockRecord, 123, 'test_key');

    expect(mockRecord.setExtensionField).not.toHaveBeenCalled();
  });
});

describe('saveRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExtensionMap.mockResolvedValue({
      project_100_caseIds: [3, 4],
    });
  });

  it('saves records and updates the appropriate indices', async () => {
    const records: TestCase[] = [
      {
        kind: 'TestCase',
        id: 1,
        projectId: 100,
        suiteId: 1,
        title: 'Case 1',
        createdOn: 0,
      },
      {
        kind: 'TestCase',
        id: 2,
        projectId: 200,
        suiteId: 2,
        title: 'Case 2',
        createdOn: 0,
      },
    ];

    await saveRecords(records);

    expect(mockSetExtensionFields).toHaveBeenNthCalledWith(1, IDENTIFIER, {
      case_1: records[0],
      case_2: records[1],
    });

    expect(mockSetExtensionFields).toHaveBeenNthCalledWith(2, IDENTIFIER, {
      project_100_caseIds: [3, 4, 1],
      project_200_caseIds: [2],
    });
  });

  it('does nothing with empty records array', async () => {
    await saveRecords([]);
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });
});

describe('saveNewRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips completed runs only after their children have synced', async () => {
    const runs: TestRun[] = [
      {
        kind: 'TestRun',
        id: 1,
        projectId: 100,
        suiteId: 1,
        name: 'Run 1',
        createdOn: 0,
        completed: false,
      },
      {
        kind: 'TestRun',
        id: 2,
        projectId: 100,
        suiteId: 1,
        name: 'Run 2',
        createdOn: 0,
        completed: true,
      },
    ];

    mockGetExtensionMap.mockResolvedValueOnce({
      run_1: { completed: false },
      run_2: { completed: true, childrenSynced: true },
    });

    mockGetExtensionMap.mockResolvedValueOnce({
      project_100_runIds: [3, 4],
    });

    const result = await saveNewRuns(runs);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);

    expect(mockSetExtensionFields).toHaveBeenNthCalledWith(1, IDENTIFIER, {
      run_1: runs[0],
    });

    expect(mockSetExtensionFields).toHaveBeenNthCalledWith(2, IDENTIFIER, {
      project_100_runIds: [3, 4, 1],
    });
  });

  it.each([undefined, false])('retries completed runs with childrenSynced=%s', async childrenSynced => {
    const run: TestRun = {
      kind: 'TestRun', id: 1, projectId: 100, suiteId: 1,
      name: 'Run 1', createdOn: 0, completed: true,
    };
    mockGetExtensionMap.mockResolvedValueOnce({
      run_1: { ...run, childrenSynced },
    });
    mockGetExtensionMap.mockResolvedValueOnce({ project_100_runIds: [1] });

    expect(await saveNewRuns([run])).toEqual([run]);
    expect(mockSetExtensionFields).toHaveBeenCalledWith(IDENTIFIER, { run_1: run });
  });

  it('returns empty array for empty input', async () => {
    const result = await saveNewRuns([]);

    expect(result).toEqual([]);
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });
});

describe('linkResultsToTests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links test results with most recent comments', async () => {
    const results: TestResult[] = [
      {
        kind: 'TestResult',
        id: 1,
        testId: 100,
        createdOn: 100,
        comment: 'First',
      },
      {
        kind: 'TestResult',
        id: 2,
        testId: 100,
        createdOn: 200,
        comment: 'Second',
      },
    ];

    mockGetExtensionMap.mockResolvedValue({
      test_100_comment: { timestamp: 50, comment: 'Old' },
    });

    await linkResultsToTests(results);

    expect(mockSetExtensionFields).toHaveBeenCalledWith(IDENTIFIER, {
      test_100_comment: { timestamp: 200, comment: 'Second' },
    });
  });

  it('does not update when existing comment is more recent', async () => {
    const results: TestResult[] = [
      {
        kind: 'TestResult',
        id: 1,
        testId: 100,
        createdOn: 100,
        comment: 'Old',
      },
    ];

    mockGetExtensionMap.mockResolvedValue({
      test_100_comment: { timestamp: 200, comment: 'Recent' },
    });

    await linkResultsToTests(results);

    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });
});
