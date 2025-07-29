import { IDENTIFIER } from '../../extension';
import { waitForPagedLambda, waitForIndexedLambda } from './interface';
import { saveRecords, saveNewRuns } from '../extensionFields/updates';
import { syncOpenPlans, syncCompletedPlans } from './syncPlans';

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

describe('syncOpenPlans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns without saving last sync if no projects provided', async () => {
    const result = await syncOpenPlans({
      domain: 'test',
      projectIds: [],
      ignoredSuiteIds: [],
    });
    expect(result).toEqual([]);

    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('returns an empty array if projects is undefined', async () => {
    const result = await syncOpenPlans({
      domain: 'test',
      projectIds: undefined,
      ignoredSuiteIds: [],
    });
    expect(result).toEqual([]);

    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('syncs open plans and their runs', async () => {
    const mockPlanIds = [1, 2];

    const mockRuns = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 1',
        createdOn: Date.now(),
        completed: false,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 2',
        createdOn: Date.now(),
        completed: false,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockPlanIds);
    mockWaitPaged.mockResolvedValue(mockRuns);

    const result = await syncOpenPlans({
      domain: 'test',
      projectIds: [1, 2],
      ignoredSuiteIds: [],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test', isCompleted: 0 },
      eventKey: expect.stringContaining('syncPlans-'),
      argFunc: expect.any(Function),
      numIds: 2,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ projectId: 1 });
    expect(argFunc(1)).toEqual({ projectId: 2 });

    expect(waitForPagedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncPlanRuns-'),
      usePage: false,
      isPaginated: false,
      idKey: 'planId',
      ids: mockPlanIds,
    });

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastPlanSync',
      expect.any(Number)
    );

    expect(saveRecords).toHaveBeenCalledWith(mockRuns);
    expect(result).toEqual(mockRuns);
  });

  it('does not sync runs for ignored suites', async () => {
    const mockPlanIds = [1, 2];

    const mockRuns = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 1',
        createdOn: Date.now(),
        completed: false,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 2,
        name: 'Run 2',
        createdOn: Date.now(),
        completed: false,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockPlanIds);
    mockWaitPaged.mockResolvedValue(mockRuns);

    const result = await syncOpenPlans({
      domain: 'test',
      projectIds: [1, 2],
      ignoredSuiteIds: [1],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test', isCompleted: 0 },
      eventKey: expect.stringContaining('syncPlans-'),
      argFunc: expect.any(Function),
      numIds: 2,
    });

    expect(waitForPagedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncPlanRuns-'),
      usePage: false,
      isPaginated: false,
      idKey: 'planId',
      ids: mockPlanIds,
    });

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastPlanSync',
      expect.any(Number)
    );

    const filteredRuns = mockRuns.filter(run => run.suiteId !== 1);
    expect(saveRecords).toHaveBeenCalledWith(filteredRuns);
    expect(result).toEqual(filteredRuns);
  });
});

describe('syncCompletedPlans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('early returns if no project IDs provided', async () => {
    const result = await syncCompletedPlans({
      domain: 'test',
      projectIds: [],
      ignoredSuiteIds: [],
    });
    expect(result).toEqual([]);

    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('early returns if project IDs undefined', async () => {
    const result = await syncCompletedPlans({
      domain: 'test',
      projectIds: undefined,
      ignoredSuiteIds: [],
    });
    expect(result).toEqual([]);

    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('syncs completed plans and their runs', async () => {
    const mockPlanIds = [1, 2];

    const mockRuns = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 1',
        createdOn: Date.now(),
        completed: true,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 2',
        createdOn: Date.now(),
        completed: true,
      },
    ];

    mockWaitPaged
      .mockResolvedValueOnce(mockPlanIds)
      .mockResolvedValueOnce(mockRuns);
    mockSaveRuns.mockResolvedValue(mockRuns);

    const result = await syncCompletedPlans({
      domain: 'test',
      projectIds: [1, 2],
      ignoredSuiteIds: [],
    });

    expect(waitForPagedLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        lambdaFunc: expect.any(Function),
        args: { domain: 'test', isCompleted: 1, limit: 250 },
        eventKey: expect.stringContaining('syncCompletedPlans-'),
        usePage: false,
        idKey: 'projectId',
        ids: [1, 2],
      })
    );

    expect(waitForPagedLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        lambdaFunc: expect.any(Function),
        args: { domain: 'test' },
        eventKey: expect.stringContaining('syncPlanRuns-'),
        usePage: false,
        isPaginated: false,
        idKey: 'planId',
        ids: mockPlanIds,
      })
    );

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastCompletedPlanSync',
      expect.any(Number)
    );

    expect(saveNewRuns).toHaveBeenCalledWith(mockRuns);
    expect(result).toEqual(mockRuns);
  });

  it('does not sync runs for ignored suites', async () => {
    const mockPlanIds = [1, 2];
    const ignoredSuiteIds = [1];

    const mockRuns = [
      {
        id: 1,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 1,
        name: 'Run 1',
        createdOn: Date.now(),
        completed: true,
      },
      {
        id: 2,
        kind: 'TestRun',
        projectId: 100,
        suiteId: 2,
        name: 'Run 2',
        createdOn: Date.now(),
        completed: true,
      },
    ];

    const filteredRuns = mockRuns.filter(
      run => !ignoredSuiteIds.includes(run.suiteId)
    );

    mockWaitPaged
      .mockResolvedValueOnce(mockPlanIds)
      .mockResolvedValueOnce(mockRuns);
    mockSaveRuns.mockResolvedValue(filteredRuns);

    const result = await syncCompletedPlans({
      domain: 'test',
      projectIds: [1, 2],
      ignoredSuiteIds,
    });

    expect(waitForPagedLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        lambdaFunc: expect.any(Function),
        args: { domain: 'test', isCompleted: 1, limit: 250 },
        eventKey: expect.stringContaining('syncCompletedPlans-'),
        usePage: false,
        idKey: 'projectId',
        ids: [1, 2],
      })
    );

    expect(waitForPagedLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        lambdaFunc: expect.any(Function),
        args: { domain: 'test' },
        eventKey: expect.stringContaining('syncPlanRuns-'),
        usePage: false,
        isPaginated: false,
        idKey: 'planId',
        ids: mockPlanIds,
      })
    );

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastCompletedPlanSync',
      expect.any(Number)
    );

    expect(saveNewRuns).toHaveBeenCalledWith(filteredRuns);
    expect(result).toEqual(filteredRuns);
  });
});
