import { TestCase, Test } from '../../extension';
import queryExtensionFields from './queryExtensionFields';
import {
  fieldName,
  indexKeyForRecord,
  indexKeyForKindAndParent,
  getRecords,
  getProjectRecords,
  getProjectSuiteMapping,
  getLinkedComments,
  getAllRunIds,
  getRunRowData,
} from './queries';

const mockGetExtensionField = jest.fn();
(global as any).aha = {
  account: {
    getExtensionField: mockGetExtensionField,
  },
};

jest.mock('./queryExtensionFields', () => ({
  default: jest.fn(),
}));

const mockQueryFields = queryExtensionFields as jest.Mock;

describe('fieldName', () => {
  it('returns correct format for Status', () => {
    expect(fieldName('Status', 1)).toBe('status_1');
  });

  it('returns correct format for Project', () => {
    expect(fieldName('Project', 2)).toBe('project_2');
  });

  it('returns correct format for Suite', () => {
    expect(fieldName('Suite', 3)).toBe('suite_3');
  });

  it('returns correct format for Section', () => {
    expect(fieldName('Section', 4)).toBe('section_4');
  });

  it('returns correct format for TestCase', () => {
    expect(fieldName('TestCase', 5)).toBe('case_5');
  });

  it('returns correct format for TestRun', () => {
    expect(fieldName('TestRun', 6)).toBe('run_6');
  });

  it('returns correct format for Test', () => {
    expect(fieldName('Test', 7)).toBe('test_7');
  });
});

describe('indexKeyForRecord', () => {
  it('returns correct key for Status', () => {
    expect(
      indexKeyForRecord({
        kind: 'Status',
        id: 1,
        label: 'Pass',
        colorBright: 1,
        colorMedium: 2,
        colorDark: 3,
      })
    ).toBe('statusIds');
  });

  it('returns correct key for Project', () => {
    expect(
      indexKeyForRecord({
        kind: 'Project',
        id: 1,
        name: 'Test Project',
      })
    ).toBe('projectIds');
  });

  it('returns correct key for Suite with project', () => {
    expect(
      indexKeyForRecord({
        kind: 'Suite',
        id: 1,
        projectId: 2,
        name: 'Test Suite',
      })
    ).toBe('project_2_suiteIds');
  });

  it('returns correct key for Section with project', () => {
    expect(
      indexKeyForRecord({
        kind: 'Section',
        id: 1,
        projectId: 2,
        suiteId: 3,
        name: 'Test Section',
      })
    ).toBe('project_2_sectionIds');
  });

  it('returns correct key for TestCase with project', () => {
    expect(
      indexKeyForRecord({
        kind: 'TestCase',
        id: 1,
        projectId: 2,
        suiteId: 3,
        title: 'Test Case',
        createdOn: 123,
      })
    ).toBe('project_2_caseIds');
  });

  it('returns correct key for open TestRun with project', () => {
    expect(
      indexKeyForRecord({
        kind: 'TestRun',
        id: 1,
        projectId: 2,
        suiteId: 3,
        name: 'Test Run',
        createdOn: 123,
        completed: false,
      })
    ).toBe('project_2_openRunIds');
  });

  it('returns correct key for completed TestRun with project', () => {
    expect(
      indexKeyForRecord({
        kind: 'TestRun',
        id: 1,
        projectId: 2,
        suiteId: 3,
        name: 'Test Run',
        createdOn: 123,
        completed: true,
      })
    ).toBe('project_2_completedRunIds');
  });

  it('returns correct key for Test with run', () => {
    expect(
      indexKeyForRecord({
        kind: 'Test',
        id: 1,
        runId: 2,
        caseId: 3,
        statusId: 4,
      })
    ).toBe('run_2_testIds');
  });

  it('returns correct key for TestResult with test', () => {
    expect(
      indexKeyForRecord({
        kind: 'TestResult',
        id: 1,
        testId: 2,
        comment: 'Test Result',
        createdOn: 123,
      })
    ).toBe('test_2_comment');
  });
});

describe('indexKeyForKindAndParent', () => {
  it('returns correct key for Status', () => {
    expect(indexKeyForKindAndParent('Status')).toBe('statusIds');
  });

  it('returns correct key for Project', () => {
    expect(indexKeyForKindAndParent('Project')).toBe('projectIds');
  });

  it('returns correct key for Suite with project', () => {
    expect(indexKeyForKindAndParent('Suite', 1)).toBe('project_1_suiteIds');
  });

  it('returns correct key for TestCase with project', () => {
    expect(indexKeyForKindAndParent('TestCase', 1)).toBe('project_1_caseIds');
  });

  it('returns correct key for OpenRun with project', () => {
    expect(indexKeyForKindAndParent('OpenRun', 1)).toBe(
      'project_1_openRunIds'
    );
  });

  it('returns correct key for CompletedRun with project', () => {
    expect(indexKeyForKindAndParent('CompletedRun', 1)).toBe(
      'project_1_completedRunIds'
    );
  });

  it('returns correct key for Test with run', () => {
    expect(indexKeyForKindAndParent('Test', 1)).toBe('run_1_testIds');
  });

  it('returns correct key for TestResult with test', () => {
    expect(indexKeyForKindAndParent('TestResult', 1)).toBe('test_1_comment');
  });
});

describe('getRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const result = await getRecords([], 'Project');
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined input', async () => {
    const result = await getRecords(undefined, 'Project');
    expect(result).toEqual([]);
  });

  it('fetches and sorts records by ID descending', async () => {
    const mockRecords = [
      { id: 1, name: 'Record 1' },
      { id: 3, name: 'Record 3' },
      { id: 2, name: 'Record 2' },
    ];

    mockQueryFields.mockResolvedValue(
      mockRecords.map(record => ({ value: record }))
    );

    const result = await getRecords([1, 2, 3], 'Project');
    expect(result).toEqual([
      { id: 3, name: 'Record 3' },
      { id: 2, name: 'Record 2' },
      { id: 1, name: 'Record 1' },
    ]);
  });
});

describe('getProjectRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty object for empty input', async () => {
    const result = await getProjectRecords([], 'Suite');
    expect(result).toEqual({});
  });

  it('returns empty object for undefined input', async () => {
    const result = await getProjectRecords(undefined, 'Suite');
    expect(result).toEqual({});
  });

  it('groups records by project ID', async () => {
    const mockIndexFields = [{ value: [1, 2, 3] }];

    const mockRecords = [
      { id: 1, projectId: 1, name: 'Record 1' },
      { id: 2, projectId: 1, name: 'Record 2' },
      { id: 3, projectId: 2, name: 'Record 3' },
    ];

    mockQueryFields
      .mockResolvedValueOnce(mockIndexFields)
      .mockResolvedValueOnce(mockRecords.map(record => ({ value: record })));

    const result = await getProjectRecords([1, 2], 'Suite');

    expect(result).toEqual({
      1: [
        { id: 2, projectId: 1, name: 'Record 2' },
        { id: 1, projectId: 1, name: 'Record 1' },
      ],
      2: [{ id: 3, projectId: 2, name: 'Record 3' }],
    });
  });
});

describe('getProjectSuiteMapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty object for empty input', async () => {
    const result = await getProjectSuiteMapping([], []);
    expect(result).toEqual({});
  });

  it('maps suites to projects correctly', async () => {
    mockQueryFields.mockResolvedValue([
      { name: 'project_1_suiteIds', value: [1, 2] },
      { name: 'project_2_suiteIds', value: [3, 4] },
    ]);

    const result = await getProjectSuiteMapping([1, 2], []);

    expect(result).toEqual({
      1: [1, 2],
      2: [3, 4],
    });
  });

  it('ignores specified suite IDs', async () => {
    const ignoredSuiteIds = [2, 4];

    mockQueryFields.mockResolvedValue([
      { name: 'project_1_suiteIds', value: [1, 2] },
      { name: 'project_2_suiteIds', value: [3, 4] },
    ]);

    const result = await getProjectSuiteMapping([1, 2], ignoredSuiteIds);

    expect(result).toEqual({
      1: [1],
      2: [3],
    });
  });
});

describe('getLinkedComments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty object for empty input', async () => {
    const result = await getLinkedComments([]);
    expect(result).toEqual({});
  });

  it('maps comments to test IDs correctly', async () => {
    const ids = [1, 2];

    const mockComments = {
      test_1_comment: { timestamp: 123, comment: 'Comment 1' },
      test_2_comment: { timestamp: 456, comment: 'Comment 2' },
    };

    mockQueryFields.mockResolvedValue([
      { name: 'test_1_comment', value: mockComments['test_1_comment'] },
      { name: 'test_2_comment', value: mockComments['test_2_comment'] },
    ]);

    const result = await getLinkedComments(ids);

    expect(result).toEqual({
      1: mockComments['test_1_comment'],
      2: mockComments['test_2_comment'],
    });
  });
});

describe('getAllRunIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no projects exist', async () => {
    mockGetExtensionField.mockResolvedValue(null);

    const result = await getAllRunIds();
    expect(result).toEqual([]);
  });

  it('collects all run IDs from all projects', async () => {
    mockGetExtensionField.mockResolvedValue([1, 2]);
    mockQueryFields.mockResolvedValue([{ value: [1, 2] }, { value: [3, 4] }]);

    const result = await getAllRunIds();

    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe('getRunRowData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty result for undefined runIds', async () => {
    const [testMap, tests] = await getRunRowData(undefined);

    expect(testMap).toEqual({});
    expect(tests).toEqual([]);
  });

  it('maps test cases and tests to runs correctly', async () => {
    const mockTests = [
      { id: 1, runId: 1, caseId: 1, statusId: 1, kind: 'Test' },
      { id: 2, runId: 1, caseId: 2, statusId: 1, kind: 'Test' },
    ];

    const mockTestCases: TestCase[] = [
      {
        id: 1,
        projectId: 1,
        suiteId: 1,
        title: 'Case 1',
        createdOn: 123,
        kind: 'TestCase',
      },
      {
        id: 2,
        projectId: 1,
        suiteId: 1,
        title: 'Case 2',
        createdOn: 123,
        kind: 'TestCase',
      },
    ];

    mockQueryFields
      .mockResolvedValueOnce([{ value: [1, 2] }])
      .mockResolvedValueOnce(mockTests.map(test => ({ value: test })))
      .mockResolvedValueOnce(
        mockTestCases.map(testCase => ({ value: testCase }))
      );

    const [testMap, tests] = await getRunRowData([1]);

    expect(testMap).toEqual({
      1: [
        [mockTestCases[1], mockTests[1]],
        [mockTestCases[0], mockTests[0]],
      ],
    });

    expect(tests).toEqual([...mockTests].reverse());
  });
});
