import { IDENTIFIER } from '../../extension';
import { waitForIndexedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncTests from './syncTests';

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

describe('syncTests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array if no run IDs provided', async () => {
    const result = await syncTests({ domain: 'test', runIds: [] });
    expect(result).toEqual([]);

    expect(waitForIndexedLambda).not.toHaveBeenCalled();
    expect(saveRecords).not.toHaveBeenCalled();
  });

  it('returns empty array if run IDs undefined', async () => {
    const result = await syncTests({ domain: 'test', runIds: undefined });
    expect(result).toEqual([]);

    expect(waitForIndexedLambda).not.toHaveBeenCalled();
    expect(saveRecords).not.toHaveBeenCalled();
  });

  it('syncs and saves tests', async () => {
    const mockTests = [
      {
        id: 1,
        kind: 'Test',
        caseId: 100,
        runId: 1,
        statusId: 1,
      },
      {
        id: 2,
        kind: 'Test',
        caseId: 101,
        runId: 1,
        statusId: 2,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockTests);

    const result = await syncTests({ domain: 'test', runIds: [1] });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncTests-'),
      argFunc: expect.any(Function),
      numIds: 1,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ runId: 1 });

    expect(saveRecords).toHaveBeenCalledWith(mockTests);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastTestSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockTests);
  });

  it('syncs tests from multiple runs', async () => {
    const mockTests = [
      {
        id: 1,
        kind: 'Test',
        caseId: 100,
        runId: 1,
        statusId: 1,
      },
      {
        id: 2,
        kind: 'Test',
        caseId: 101,
        runId: 2,
        statusId: 2,
      },
    ];

    mockWaitIndexed.mockResolvedValue(mockTests);

    const result = await syncTests({ domain: 'test', runIds: [1, 2] });

    expect(waitForIndexedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncTests-'),
      argFunc: expect.any(Function),
      numIds: 2,
    });

    const { argFunc } = mockWaitIndexed.mock.calls[0][0];
    expect(argFunc(0)).toEqual({ runId: 1 });
    expect(argFunc(1)).toEqual({ runId: 2 });

    expect(saveRecords).toHaveBeenCalledWith(mockTests);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastTestSync',
      expect.any(Number)
    );

    expect(result).toEqual(mockTests);
  });

  it('handles empty test list', async () => {
    mockWaitIndexed.mockResolvedValue([]);

    const result = await syncTests({ domain: 'test', runIds: [1] });

    expect(saveRecords).toHaveBeenCalledWith([]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastTestSync',
      expect.any(Number)
    );

    expect(result).toEqual([]);
  });
});
