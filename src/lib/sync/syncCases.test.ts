import { IDENTIFIER, TestCase } from '../../extension';
import { waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncCases from './syncCases';

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

describe('syncCases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error if no projects found', async () => {
    await expect(
      syncCases({
        domain: 'test',
        lastCaseSync: 0,
        projectSuites: {},
      })
    ).rejects.toThrow('No synced projects found, aborting test case sync.');
  });

  it('syncs cases', async () => {
    const mockCases: TestCase[] = [
      {
        id: 1,
        kind: 'TestCase',
        projectId: 1,
        suiteId: 1,
        title: 'Case 1',
        createdOn: 0,
      },
      {
        id: 2,
        kind: 'TestCase',
        projectId: 1,
        suiteId: 1,
        title: 'Case 2',
        createdOn: 0,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockCases);

    const result = await syncCases({
      domain: 'test',
      lastCaseSync: 0,
      projectSuites: {
        '1': [100, 101],
        '2': [102],
      },
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncCases-'),
      argFunc: expect.any(Function),
      numIds: 3,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];

    expect(argFunc(0)).toEqual({ projectId: '1', suiteId: 100 });
    expect(argFunc(1)).toEqual({ projectId: '1', suiteId: 101 });
    expect(argFunc(2)).toEqual({ projectId: '2', suiteId: 102 });

    expect(saveRecords).toHaveBeenCalledWith(mockCases);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastCaseSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockCases);
  });

  it('includes updatedAfter parameter when lastCaseSync provided', async () => {
    const lastSync = Date.now();
    mockWaitIndexed.mockResolvedValue([]);

    await syncCases({
      domain: 'test',
      lastCaseSync: lastSync,
      projectSuites: { '1': [] },
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: {
        domain: 'test',
        updatedAfter: Math.floor(lastSync / 1000),
      },
      eventKey: expect.stringContaining('syncCases-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });
  });
});
