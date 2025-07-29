import { IDENTIFIER } from '../../extension';
import { waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncSuites from './syncSuites';

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

describe('syncSuites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('early returns if no project IDs provided', async () => {
    const result = await syncSuites({
      domain: 'test',
      projectIds: [],
      ignoredSuiteIds: [],
    });

    expect(result).toEqual([]);
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('early returns if project IDs undefined', async () => {
    const result = await syncSuites({
      domain: 'test',
      projectIds: undefined,
      ignoredSuiteIds: [],
    });

    expect(result).toEqual([]);
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('syncs and saves suites', async () => {
    const mockSuites = [
      {
        id: 1,
        kind: 'Suite',
        name: 'Suite 1',
        projectId: 100,
      },
      {
        id: 2,
        kind: 'Suite',
        name: 'Suite 2',
        projectId: 100,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSuites);

    const result = await syncSuites({
      domain: 'test',
      projectIds: [100],
      ignoredSuiteIds: [],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      argFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSuites-'),
      numIds: 1,
    });

    expect(saveRecords).toHaveBeenCalledWith(mockSuites);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSuiteSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockSuites);
  });

  it('syncs suites from multiple projects', async () => {
    const mockSuites = [
      {
        id: 1,
        kind: 'Suite',
        name: 'Suite 1',
        projectId: 100,
      },
      {
        id: 2,
        kind: 'Suite',
        name: 'Suite 2',
        projectId: 101,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSuites);

    const result = await syncSuites({
      domain: 'test',
      projectIds: [100, 101],
      ignoredSuiteIds: [],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      argFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSuites-'),
      numIds: 2,
    });

    expect(saveRecords).toHaveBeenCalledWith(mockSuites);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSuiteSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockSuites);
  });

  it('handles empty suite list', async () => {
    mockWaitIndexed.mockResolvedValue([]);

    const result = await syncSuites({
      domain: 'test',
      projectIds: [100],
      ignoredSuiteIds: [],
    });

    expect(saveRecords).toHaveBeenCalledWith([]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSuiteSync',
      expect.any(Number)
    );

    expect(result).toEqual([]);
  });

  it('does not sync ignored suites', async () => {
    const mockSuites = [
      {
        id: 1,
        kind: 'Suite',
        name: 'Suite 1',
        projectId: 100,
      },
      {
        id: 2,
        kind: 'Suite',
        name: 'Suite 2',
        projectId: 100,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockSuites);

    const result = await syncSuites({
      domain: 'test',
      projectIds: [100],
      ignoredSuiteIds: [1],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      argFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncSuites-'),
      numIds: 1,
    });

    expect(saveRecords).toHaveBeenCalledWith([mockSuites[1]]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastSuiteSync',
      expect.any(Number)
    );

    expect(result).toEqual([mockSuites[1]]);
  });
});
