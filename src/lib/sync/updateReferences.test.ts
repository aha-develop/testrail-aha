import { IDENTIFIER } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { waitForBatchedMutation } from './interface';
import { updateReferences } from './updateReferences';

jest.mock('./interface', () => ({
  ...jest.requireActual('./interface'),
  waitForBatchedMutation: jest.fn(),
}));

const mockWait = waitForBatchedMutation as jest.Mock;
const getSetting = jest.fn();
const triggerServer = jest.fn();
const loadAttributes = jest.fn();
let record: ExtensionRecord;

beforeEach(() => {
  jest.resetAllMocks();
  (global as any).aha = { settings: { get: getSetting }, triggerServer };
  getSetting.mockReturnValue(true);

  mockWait.mockImplementation(async ({ eventKeys }) =>
    Object.fromEntries(eventKeys.map(key => [key, { error: false }]))
  );

  record = {
    id: '100',
    typename: 'Feature',
    referenceNum: 'ABC-1',
    loadAttributes,
  } as unknown as ExtensionRecord;
});

it.each([false, undefined])(
  'does not load or dispatch when setting is %p',
  async setting => {
    getSetting.mockReturnValue(setting);
    await updateReferences(record, [12]);

    expect(loadAttributes).not.toHaveBeenCalled();
    expect(mockWait).not.toHaveBeenCalled();
  }
);

it('does nothing for an empty batch', async () => {
  await updateReferences(record, []);

  expect(getSetting).not.toHaveBeenCalled();
  expect(mockWait).not.toHaveBeenCalled();
});

it.each(['Feature', 'Requirement', 'Epic', 'Iteration'])(
  'loads and uses the reference of a %s',
  async typename => {
    Object.assign(record, { typename, referenceNum: undefined });
    loadAttributes.mockImplementation(async () => {
      Object.assign(record, { referenceNum: 'ABC-1' });
    });

    await updateReferences(record, [12, 12, 13]);
    expect(loadAttributes).toHaveBeenCalledWith('referenceNum');
    expect(mockWait).toHaveBeenCalledTimes(1);

    const { lambdaFunc, argsForKeys, eventKeys } = mockWait.mock.calls[0][0];
    expect(eventKeys).toHaveLength(2);
    expect(eventKeys[0]).not.toBe(eventKeys[1]);

    expect(eventKeys.map(key => argsForKeys[key])).toEqual([
      { caseId: 12, reference: 'ABC-1' },
      { caseId: 13, reference: 'ABC-1' },
    ]);

    const args = { ...argsForKeys[eventKeys[0]], eventKey: eventKeys[0] };
    await lambdaFunc(args);

    expect(triggerServer).toHaveBeenCalledWith(
      `${IDENTIFIER}.updateReference`,
      args
    );
  }
);

it('gives repeated requests independent result fields', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(123);

  try {
    await updateReferences(record, [12]);
    await updateReferences(record, [12]);

    expect(mockWait.mock.calls[0][0].eventKeys[0]).not.toBe(
      mockWait.mock.calls[1][0].eventKeys[0]
    );
  } finally {
    jest.restoreAllMocks();
  }
});

it('collects errors while retaining successful cases from later batches', async () => {
  mockWait.mockImplementationOnce(async ({ eventKeys }) =>
    Object.fromEntries(
      eventKeys.map(key => [key, { error: true, message: 'Permission denied' }])
    )
  );

  const ids = Array.from({ length: 11 }, (_, index) => index + 1);

  await expect(updateReferences(record, ids)).rejects.toMatchObject({
    message: expect.stringContaining('Permission denied'),
    successfulCaseIds: [6, 7, 8, 9, 10, 11],
  });

  expect(mockWait).toHaveBeenCalledTimes(3);
});

it('retains successes within a batch and across earlier batches', async () => {
  mockWait.mockImplementation(async ({ eventKeys, argsForKeys }) =>
    Object.fromEntries(
      eventKeys.map(key => [
        key,
        argsForKeys[key].caseId === 7
          ? { error: true, message: 'Permission denied' }
          : { error: false },
      ])
    )
  );

  const ids = Array.from({ length: 11 }, (_, index) => index + 1);
  await expect(updateReferences(record, ids)).rejects.toMatchObject({
    message: 'Could not sync reference for test case C7: Permission denied',
    successfulCaseIds: ids.filter(id => id !== 7),
  });
});

it('retains earlier successes when a later batch throws', async () => {
  mockWait
    .mockImplementationOnce(async ({ eventKeys }) =>
      Object.fromEntries(eventKeys.map(key => [key, { error: false }]))
    )
    .mockRejectedValueOnce(new Error('Connection lost'));

  await expect(
    updateReferences(record, [1, 2, 3, 4, 5, 6])
  ).rejects.toMatchObject({
    name: 'ReferenceUpdateError',
    message: 'Connection lost',
    successfulCaseIds: [1, 2, 3, 4, 5],
  });
});

it('rejects a missing result', async () => {
  mockWait.mockResolvedValueOnce({});
  await expect(updateReferences(record, [12])).rejects.toThrow(
    'Could not sync reference'
  );
});

it('does not dispatch an empty Aha! reference', async () => {
  Object.assign(record, { referenceNum: '' });

  await expect(updateReferences(record, [12])).rejects.toThrow(
    'Error retrieving Aha! record reference'
  );

  expect(mockWait).not.toHaveBeenCalled();
});
