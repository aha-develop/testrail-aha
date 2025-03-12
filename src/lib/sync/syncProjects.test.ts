import { IDENTIFIER } from '../../extension';
import { waitForPagedLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';
import syncProjects from './syncProjects';

jest.mock('./interface', () => ({
  waitForPagedLambda: jest.fn(),
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

const mockWaitPaged = waitForPagedLambda as jest.Mock;

describe('syncProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs and saves projects', async () => {
    const mockProjects = [
      {
        id: 1,
        kind: 'Project',
        name: 'Project 1',
      },
      {
        id: 2,
        kind: 'Project',
        name: 'Project 2',
      },
    ];

    mockWaitPaged.mockResolvedValue(mockProjects);

    const result = await syncProjects({ domain: 'test' });

    expect(waitForPagedLambda).toHaveBeenCalledWith({
      lambdaFunc: expect.any(Function),
      args: { domain: 'test' },
      eventKey: expect.stringContaining('syncProjects-'),
    });

    expect(saveRecords).toHaveBeenCalledWith(mockProjects);
    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastProjectSync',
      expect.any(Number)
    );
    expect(result).toEqual(mockProjects);
  });

  it('handles empty project list', async () => {
    mockWaitPaged.mockResolvedValue([]);

    const result = await syncProjects({ domain: 'test' });

    expect(saveRecords).toHaveBeenCalledWith([]);

    expect(mockSetExtensionField).toHaveBeenCalledWith(
      IDENTIFIER,
      'lastProjectSync',
      expect.any(Number)
    );

    expect(result).toEqual([]);
  });

  it('triggers correct server event', async () => {
    mockWaitPaged.mockResolvedValue([]);

    await syncProjects({ domain: 'test' });

    const { lambdaFunc } = mockWaitPaged.mock.calls[0][0];

    await lambdaFunc({ testArg: 'value' });

    expect(aha.triggerServer).toHaveBeenCalledWith(
      `${IDENTIFIER}.syncProjects`,
      { testArg: 'value' }
    );
  });
});
