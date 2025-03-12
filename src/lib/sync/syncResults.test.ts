import { IDENTIFIER } from '../../extension';
import { waitForIndexedLambda } from './interface';
import { linkResultsToTests } from '../extensionFields/updates';
import syncResults from './syncResults';

jest.mock('./interface', () => ({
  waitForIndexedLambda: jest.fn(),
}));

jest.mock('../extensionFields/updates', () => ({
  linkResultsToTests: jest.fn(),
}));

const mockSetExtensionField = jest.fn();
(global as any).aha = {
  account: {
    setExtensionField: mockSetExtensionField,
  },
  triggerServer: jest.fn(),
};

const mockWaitIndexed = waitForIndexedLambda as jest.Mock;

describe('syncResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array if no run IDs provided', async () => {
    const result = await syncResults({ domain: 'test', runIds: [] });
    expect(result).toEqual([]);

    expect(waitForIndexedLambda).not.toHaveBeenCalled();
    expect(linkResultsToTests).not.toHaveBeenCalled();
  });

  it('returns empty array if run IDs undefined', async () => {
    const result = await syncResults({ domain: 'test', runIds: undefined });
    expect(result).toEqual([]);

    expect(waitForIndexedLambda).not.toHaveBeenCalled();
    expect(linkResultsToTests).not.toHaveBeenCalled();
  });

  it('syncs and links test results', async () => {
    const mockResults = [
      {
        id: 1,
        kind: 'TestResult',
        testId: 100,
        comment: 'Test Result 1',
        createdOn: Date.now(),
      },
      {
        id: 2,
        kind: 'TestResult',
        testId: 101,
        comment: 'Test Result 2',
        createdOn: Date.now(),
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockResults);

    const result = await syncResults({ domain: 'test', runIds: [1] });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncRuns-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ runId: 1 });

    expect(linkResultsToTests).toHaveBeenCalledWith(mockResults);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastResultSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockResults);
  });

  it('includes createdAfter parameter when lastResultSync provided', async () => {
    const lastResultSync = Date.now();
    mockWaitIndexed.mockResolvedValue([]);

    await syncResults({
      domain: 'test',
      lastResultSync,
      runIds: [1],
    });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: {
        domain: 'test',
        createdAfter: Math.floor(lastResultSync / 1000),
      },
      eventKey: expect.stringContaining('syncRuns-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });
  });

  it('syncs results from multiple runs', async () => {
    const mockResults = [
      {
        id: 1,
        kind: 'TestResult',
        testId: 100,
        comment: 'Test Result 1',
        createdOn: Date.now(),
      },
      {
        id: 2,
        kind: 'TestResult',
        testId: 101,
        comment: 'Test Result 2',
        createdOn: Date.now(),
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockResults);

    const result = await syncResults({ domain: 'test', runIds: [1, 2] });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncRuns-'),
      argFunc: expect.any(Function),
      numIds: 2,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];

    expect(argFunc(0)).toEqual({ runId: 1 });
    expect(argFunc(1)).toEqual({ runId: 2 });

    expect(linkResultsToTests).toHaveBeenCalledWith(mockResults);
    expect(result).toEqual(mockResults);
  });

  it('handles empty result list', async () => {
    mockWaitIndexed.mockResolvedValue([]);

    const result = await syncResults({ domain: 'test', runIds: [1] });

    expect(linkResultsToTests).toHaveBeenCalledWith([]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastResultSync',
      expect.any(Number)
    );

    expect(result).toEqual([]);
  });
});
