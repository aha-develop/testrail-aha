import { IDENTIFIER } from '../../extension';
import { waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncSections from './syncSections';

jest.mock('./interface', () => ({
  waitForIndexedLambda: jest.fn(),
}));

jest.mock('../extensionFields/updates', () => ({
  saveRecords: jest.fn(),
}));

const mockSetExtensionField = jest.fn();
(global as any).aha = {
  account: {
    setExtensionField: mockSetExtensionField,
  },
  triggerServer: jest.fn(),
};

const mockWaitIndexed = waitForIndexedLambda as jest.Mock;

describe('syncSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('early returns if no projects found', async () => {
    const result = await syncSections({
      domain: 'test',
      projectSuites: {},
      ignoredSuiteIds: [],
    });

    expect(result).toEqual([]);
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('syncs sections without suites', async () => {
    const mockSections = [
      {
        id: 1,
        kind: 'Section',
        projectId: 100,
        suiteId: 1,
        name: 'Section 1',
      },
      {
        id: 2,
        kind: 'Section',
        projectId: 100,
        suiteId: 1,
        name: 'Section 2',
        parentId: 1,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSections);

    const result = await syncSections({
      domain: 'test',
      projectSuites: { '100': [] },
      ignoredSuiteIds: [],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSections-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ projectId: '100' });

    expect(saveRecords).toHaveBeenCalledWith(mockSections);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSectionSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockSections);
  });

  it('syncs sections with suites', async () => {
    const mockSections = [
      {
        id: 1,
        kind: 'Section',
        projectId: 100,
        suiteId: 1,
        name: 'Section 1',
      },
      {
        id: 2,
        kind: 'Section',
        projectId: 100,
        suiteId: 2,
        name: 'Section 2',
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSections);

    const result = await syncSections({
      domain: 'test',
      projectSuites: {
        '100': [1, 2],
        '101': [3],
      },
      ignoredSuiteIds: [],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSections-'),
      argFunc: expect.any(Function),
      numIds: 3,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ projectId: '100', suiteId: 1 });
    expect(argFunc(1)).toEqual({ projectId: '100', suiteId: 2 });
    expect(argFunc(2)).toEqual({ projectId: '101', suiteId: 3 });

    expect(saveRecords).toHaveBeenCalledWith(mockSections);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSectionSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockSections);
  });

  it('handles mix of projects with and without suites', async () => {
    const mockSections = [
      {
        id: 1,
        kind: 'Section',
        projectId: 100,
        suiteId: 1,
        name: 'Section 1',
      },
      {
        id: 2,
        kind: 'Section',
        projectId: 101,
        suiteId: 2,
        name: 'Section 2',
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSections);

    await syncSections({
      domain: 'test',
      projectSuites: {
        '100': [1],
        '101': [],
        '102': [2, 3],
      },
      ignoredSuiteIds: [],
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];

    expect(argFunc(0)).toEqual({ projectId: '100', suiteId: 1 });
    expect(argFunc(1)).toEqual({ projectId: '101' });
    expect(argFunc(2)).toEqual({ projectId: '102', suiteId: 2 });
    expect(argFunc(3)).toEqual({ projectId: '102', suiteId: 3 });
  });

  it('handles empty section list', async () => {
    mockWaitIndexed.mockResolvedValue([]);

    const result = await syncSections({
      domain: 'test',
      projectSuites: { '100': [1] },
      ignoredSuiteIds: [],
    });

    expect(saveRecords).toHaveBeenCalledWith([]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSectionSync',
      expect.any(Number)
    );

    expect(result).toEqual([]);
  });

  it('skips syncing sections from ignored suites', async () => {
    const mockSections = [
      {
        id: 1,
        kind: 'Section',
        projectId: 100,
        suiteId: 2,
        name: 'Section 1',
      },
      {
        id: 2,
        kind: 'Section',
        projectId: 100,
        suiteId: 2,
        name: 'Section 2',
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSections);

    const result = await syncSections({
      domain: 'test',
      projectSuites: { '100': [1, 2] },
      ignoredSuiteIds: [1],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSections-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];

    expect(argFunc(0)).toEqual({ projectId: '100', suiteId: 2 });

    expect(saveRecords).toHaveBeenCalledWith(mockSections);
    expect(result).toEqual(mockSections);
  });
});
