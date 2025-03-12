import { IDENTIFIER, TestRun } from '../../extension';
import { waitForPagedLambda, waitForIndexedLambda } from './interface';
import { saveRecords, saveNewRuns } from '../extensionFields/updates';
import { syncOpenRuns, syncCompletedRuns } from './syncRuns';

jest.mock('./interface', () => ({
  waitForPagedLambda: jest.fn(),
  waitForIndexedLambda: jest.fn(),
}));

jest.mock('../extensionFields/updates', () => ({
  saveRecords: jest.fn(),
  saveNewRuns: jest.fn(),
}));

const mockSetExtensionField = jest.fn();
(global as any).aha = {
  account: {
    setExtensionField: mockSetExtensionField,
  },
  triggerServer: jest.fn(),
};

const mockWaitIndexed = waitForIndexedLambda as jest.Mock;
const mockWaitPaged = waitForPagedLambda as jest.Mock;
const mockSaveRuns = saveNewRuns as jest.Mock;

describe('syncOpenRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error if no project IDs provided', async () => {
    await expect(
      syncOpenRuns({ domain: 'test', projectIds: [] })
    ).rejects.toThrow('No synced projects found, aborting open test run sync.');
  });

  it('throws error if project IDs undefined', async () => {
    await expect(
      syncOpenRuns({ domain: 'test', projectIds: undefined })
    ).rejects.toThrow('No synced projects found, aborting open test run sync.');
  });

  it('syncs and saves open runs', async () => {
    const mockRuns: TestRun[] = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 1,
        suiteId: 1,
        createdOn: 0,
        name: 'Run 1',
        completed: false,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 1,
        suiteId: 1,
        createdOn: 0,
        name: 'Run 2',
        completed: false,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockRuns);

    const result = await syncOpenRuns({ domain: 'test', projectIds: [1, 2] });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test', isCompleted: 0 },
      eventKey: expect.stringContaining('syncRuns-'),
      argFunc: expect.any(Function),
      numIds: 2,
    });

    expect(saveRecords).toHaveBeenCalledWith(mockRuns);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastRunSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockRuns);
  });

  it('passes correct project ID to argFunc', async () => {
    mockWaitIndexed.mockResolvedValue([]);

    await syncOpenRuns({ domain: 'test', projectIds: [42] });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];

    expect(argFunc(0)).toEqual({ projectId: 42 });
  });
});

describe('syncCompletedRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error if no project IDs provided', async () => {
    await expect(
      syncCompletedRuns({ domain: 'test', projectIds: [] })
    ).rejects.toThrow(
      'No synced projects found, aborting completed test run sync.'
    );
  });

  it('throws error if project IDs undefined', async () => {
    await expect(
      syncCompletedRuns({ domain: 'test', projectIds: undefined })
    ).rejects.toThrow(
      'No synced projects found, aborting completed test run sync.'
    );
  });

  it('syncs and saves completed runs', async () => {
    const mockRuns: TestRun[] = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 1,
        suiteId: 1,
        createdOn: 0,
        name: 'Run 1',
        completed: true,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 1,
        suiteId: 1,
        createdOn: 0,
        name: 'Run 2',
        completed: true,
      },
    ];

    mockWaitPaged.mockResolvedValue(mockRuns);
    mockSaveRuns.mockResolvedValue(mockRuns);

    const result = await syncCompletedRuns({
      domain: 'test',
      projectIds: [1, 2],
    });

    expect(waitForPagedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test', isCompleted: 1, limit: 250 },
      eventKey: expect.stringContaining('syncCompletedRuns-'),
      usePage: false,
      idKey: 'projectId',
      ids: [1, 2],
    });

    expect(saveNewRuns).toHaveBeenCalledWith(mockRuns);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastCompletedRunSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockRuns);
  });
});
