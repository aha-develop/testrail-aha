import { IDENTIFIER, Suite } from '../extension';
import { deleteIgnoredSuiteRecords } from './ignore';
import {
  getAccountExtensionFields,
  getProjectRecords,
  getRecords,
} from './extensionFields/queries';
import { deleteChunked } from './extensionFields/updates';

// Mock the global aha object
const mockSetExtensionFields = jest.fn();
(global as any).aha = {
  account: {
    setExtensionFields: mockSetExtensionFields,
  },
};

// Mock the queries module
jest.mock('./extensionFields/queries', () => {
  const original = jest.requireActual('./extensionFields/queries');
  return {
    ...original,
    getRecords: jest.fn(),
    getProjectRecords: jest.fn(),
    getAccountExtensionFields: jest.fn(),
  };
});

// Mock the updates module
jest.mock('./extensionFields/updates', () => ({
  deleteChunked: jest.fn(),
}));

const mockGetRecords = getRecords as jest.Mock;
const mockGetProjectRecords = getProjectRecords as jest.Mock;

const mockGetAccountExtensionFields = getAccountExtensionFields as jest.Mock;

const mockDeleteChunked = deleteChunked as jest.Mock;

describe('deleteIgnoredSuiteRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return early if suiteIds is empty', async () => {
    await deleteIgnoredSuiteRecords([]);

    expect(mockGetRecords).not.toHaveBeenCalled();
    expect(mockGetProjectRecords).not.toHaveBeenCalled();
    expect(mockDeleteChunked).not.toHaveBeenCalled();
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });

  it('should return early if suiteIds is null/undefined', async () => {
    await deleteIgnoredSuiteRecords(undefined);

    expect(mockGetRecords).not.toHaveBeenCalled();
    expect(mockGetProjectRecords).not.toHaveBeenCalled();
    expect(mockDeleteChunked).not.toHaveBeenCalled();
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });

  it('should delete records for ignored suites and update indexes', async () => {
    const suiteIds = [1, 2];

    const mockSuites: Suite[] = [
      { id: 1, kind: 'Suite', name: 'Suite 1', projectId: 10 },
      { id: 2, kind: 'Suite', name: 'Suite 2', projectId: 20 },
    ];

    const mockSections = {
      10: [
        {
          id: 101,
          kind: 'Section',
          name: 'Section 1',
          projectId: 10,
          suiteId: 1,
        },
        {
          id: 102,
          kind: 'Section',
          name: 'Section to keep',
          projectId: 10,
          suiteId: 3,
        },
      ],
      20: [
        {
          id: 201,
          kind: 'Section',
          name: 'Section 3',
          projectId: 20,
          suiteId: 2,
        },
      ],
    };

    const mockTestCases = {
      10: [
        {
          id: 301,
          kind: 'TestCase',
          title: 'Case 1',
          projectId: 10,
          suiteId: 1,
          createdOn: 123,
        },
        {
          id: 302,
          kind: 'TestCase',
          title: 'Case to keep',
          projectId: 10,
          suiteId: 3,
          createdOn: 123,
        },
      ],
      20: [
        {
          id: 401,
          kind: 'TestCase',
          title: 'Case 3',
          projectId: 20,
          suiteId: 2,
          createdOn: 123,
        },
      ],
    };

    const mockTestRuns = {
      10: [
        {
          id: 501,
          kind: 'TestRun',
          name: 'Run 1',
          projectId: 10,
          suiteId: 1,
          createdOn: 123,
          completed: false,
        },
        {
          id: 502,
          kind: 'TestRun',
          name: 'Run to keep',
          projectId: 10,
          suiteId: 3,
          createdOn: 123,
          completed: false,
        },
      ],
      20: [
        {
          id: 601,
          kind: 'TestRun',
          name: 'Run 3',
          projectId: 20,
          suiteId: 2,
          createdOn: 123,
          completed: false,
        },
      ],
    };

    mockGetRecords.mockResolvedValue(mockSuites);

    mockGetProjectRecords
      .mockResolvedValueOnce(mockSections)
      .mockResolvedValueOnce(mockTestCases)
      .mockResolvedValueOnce(mockTestRuns);

    // No tests for the deleted runs in this example
    mockGetAccountExtensionFields.mockResolvedValue([]);

    await deleteIgnoredSuiteRecords(suiteIds);

    // Verify we retrieved the correct records
    expect(mockGetRecords).toHaveBeenCalledWith(suiteIds, 'Suite');

    expect(mockGetProjectRecords).toHaveBeenCalledWith([10, 20], 'Section');
    expect(mockGetProjectRecords).toHaveBeenCalledWith([10, 20], 'TestCase');
    expect(mockGetProjectRecords).toHaveBeenCalledWith([10, 20], 'TestRun');

    const expectedRecordsToDelete = [
      'section_101',
      'section_201',
      'case_301',
      'case_401',
      'run_501',
      'run_601',
      'run_501_testIds',
      'run_601_testIds',
    ];

    expect(mockDeleteChunked).toHaveBeenCalledWith(
      expect.arrayContaining(expectedRecordsToDelete)
    );

    const expectedIndexUpdates = {
      project_10_sectionIds: [102],
      project_10_caseIds: [302],
      project_10_openRunIds: [502],
      project_10_completedRunIds: [],
      project_20_sectionIds: [],
      project_20_caseIds: [],
      project_20_openRunIds: [],
      project_20_completedRunIds: [],
    };

    expect(mockSetExtensionFields).toHaveBeenCalledWith(
      IDENTIFIER,
      expectedIndexUpdates
    );
  });

  it('does nothing if there are no suites to delete', async () => {
    const suiteIds = [1];

    mockGetRecords.mockResolvedValue([]);
    await deleteIgnoredSuiteRecords(suiteIds);

    expect(mockGetProjectRecords).not.toHaveBeenCalled();

    expect(mockDeleteChunked).not.toHaveBeenCalled();
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });

  it('should handle projects with no records gracefully', async () => {
    const suiteIds = [1];

    const mockSuites: Suite[] = [
      { id: 1, kind: 'Suite', name: 'Suite 1', projectId: 10 },
    ];

    mockGetRecords.mockResolvedValue(mockSuites);
    mockGetProjectRecords
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await deleteIgnoredSuiteRecords(suiteIds);

    expect(mockGetRecords).toHaveBeenCalledWith(suiteIds, 'Suite');
    expect(mockGetProjectRecords).toHaveBeenCalledTimes(3);

    expect(mockDeleteChunked).not.toHaveBeenCalled();
    expect(mockSetExtensionFields).not.toHaveBeenCalled();
  });

  it('should only update indexes that had records initially', async () => {
    const suiteIds = [1];

    const mockSuites: Suite[] = [
      { id: 1, kind: 'Suite', name: 'Suite 1', projectId: 10 },
    ];

    const mockSections = {
      10: [
        {
          id: 101,
          kind: 'Section',
          name: 'Section 1',
          projectId: 10,
          suiteId: 1,
        },
      ],
    };

    mockGetRecords.mockResolvedValue(mockSuites);
    mockGetProjectRecords
      .mockResolvedValueOnce(mockSections)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await deleteIgnoredSuiteRecords(suiteIds);

    const expectedIndexUpdates = {
      project_10_sectionIds: [],
    };

    expect(mockSetExtensionFields).toHaveBeenCalledWith(
      IDENTIFIER,
      expectedIndexUpdates
    );
  });

  it('deletes associated tests and results for deleted test runs', async () => {
    const suiteIds = [1];

    const mockSuites: Suite[] = [
      { id: 1, kind: 'Suite', name: 'Suite 1', projectId: 10 },
    ];

    const mockTestRuns = {
      10: [
        {
          id: 501,
          kind: 'TestRun',
          name: 'Run 1',
          projectId: 10,
          suiteId: 1,
          createdOn: 123,
          completed: false,
        },
        {
          id: 502,
          kind: 'TestRun',
          name: 'Run to keep',
          projectId: 10,
          suiteId: 2,
          createdOn: 123,
          completed: false,
        },
      ],
    };

    mockGetRecords.mockResolvedValue(mockSuites);
    mockGetProjectRecords
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(mockTestRuns);

    // Returned test IDs for the deleted run
    mockGetAccountExtensionFields.mockResolvedValue([701, 702]);

    await deleteIgnoredSuiteRecords(suiteIds);

    expect(mockGetAccountExtensionFields).toHaveBeenCalledWith([
      'run_501_testIds',
    ]);

    const expectedRecordsToDelete = [
      'run_501',
      'test_701',
      'test_702',
      'test_701_comment',
      'test_702_comment',
      'run_501_testIds',
    ];

    expect(mockDeleteChunked).toHaveBeenCalledWith(
      expect.arrayContaining(expectedRecordsToDelete)
    );
  });
});
