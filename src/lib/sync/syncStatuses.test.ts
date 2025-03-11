import { IDENTIFIER } from '../../extension';
import { waitForLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncStatuses from './syncStatuses';

jest.mock('./interface', () => ({
  waitForLambda: jest.fn(),
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

const mockWait = waitForLambda as jest.Mock;

describe('syncStatuses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs and saves statuses', async () => {
    const mockStatuses = [
      {
        id: 1,
        kind: 'Status',
        label: 'Passed',
        colorBright: 123,
        colorMedium: 456,
        colorDark: 789,
      },
      {
        id: 2,
        kind: 'Status',
        label: 'Failed',
        colorBright: 321,
        colorMedium: 654,
        colorDark: 987,
      },
    ];

    mockWait.mockResolvedValue({
      error: false,
      result: mockStatuses,
    });

    await syncStatuses({ domain: 'test' });

    expect(waitForLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncStatuses-'),
    });

    expect(saveRecords).toHaveBeenCalledWith(mockStatuses);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastStatusSync',
      expect.any(Number)
    );
  });

  it('throws error when API result contains error', async () => {
    const errorMessage = 'API Error';
    mockWait.mockResolvedValue({
      error: true,
      message: errorMessage,
    });

    await expect(syncStatuses({ domain: 'test' })).rejects.toThrow(
      errorMessage
    );

    expect(saveRecords).not.toHaveBeenCalled();
    expect(mockSetExtensionField).not.toHaveBeenCalled();
  });

  it('handles empty status list', async () => {
    mockWait.mockResolvedValue({
      error: false,
      result: [],
    });

    await syncStatuses({ domain: 'test' });

    expect(saveRecords).toHaveBeenCalledWith([]);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastStatusSync',
      expect.any(Number)
    );
  });

  it('triggers correct server event', async () => {
    mockWait.mockResolvedValue({
      error: false,
      result: [],
    });

    await syncStatuses({ domain: 'test' });

    const { lambdaFunc } = mockWait.mock.calls[0][0];

    await lambdaFunc({ testArg: 'value' });

    expect(aha.triggerServer).toHaveBeenCalledWith(
      `${IDENTIFIER}.syncStatuses`,
      { testArg: 'value' }
    );
  });
});
