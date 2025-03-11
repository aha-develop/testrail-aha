import { IDENTIFIER, TestCase, TestResult, TestRun } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { getAccountExtensionFieldMap } from './queries';
import {
  linkRecord,
  unlinkRecord,
  saveRecords,
  saveNewRuns,
  linkResultsToTests,
} from './updates';

const mockGetExtensionField = jest.fn();
const mockSetExtensionField = jest.fn();

(global as any).aha = {
  account: {
    getExtensionField: mockGetExtensionField,
    setExtensionField: mockSetExtensionField,
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
    mockGetExtensionField.mockResolvedValue([3, 4]);
  });

  it('saves records and updates the appropriate index', async () => {
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
        projectId: 100,
        suiteId: 1,
        title: 'Case 2',
        createdOn: 0,
      },
    ];

    await saveRecords(records);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'case_1',
      records[0]
    );

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'case_2',
      records[1]
    );

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'project_100_caseIds',
      [3, 4, 1, 2]
    );
  });

  it('does nothing with empty records array', async () => {
    await saveRecords([]);
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });
});

describe('saveNewRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExtensionField.mockResolvedValue([3, 4]);
  });

  it('saves only non-completed runs', async () => {
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

    mockGetExtensionMap.mockResolvedValue({
      run_1: { completed: false },
      run_2: { completed: true },
    });

    const result = await saveNewRuns(runs);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'run_1',
      runs[0]
    );

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'project_100_runIds',
      [3, 4, 1]
    );
  });

  it('returns empty array for empty input', async () => {
    const result = await saveNewRuns([]);

    expect(result).toEqual([]);
    expect(mockSetExtensionField).not.toHaveBeenCalled();
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

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'test_100_comment',
      { timestamp: 200, comment: 'Second' }
    );
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

    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });
});
