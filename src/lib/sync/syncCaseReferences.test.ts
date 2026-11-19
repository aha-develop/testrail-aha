import { IDENTIFIER } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { waitForLambda } from './interface';
import { syncCaseReferences } from './syncCaseReferences';

jest.mock('./interface', () => ({ waitForLambda: jest.fn() }));

const mockWait = waitForLambda as jest.Mock;
const getSetting = jest.fn();
const triggerServer = jest.fn();
const loadAttributes = jest.fn();
let record: ExtensionRecord;

beforeEach(() => {
  jest.resetAllMocks();
  (global as any).aha = { settings: { get: getSetting }, triggerServer };
  getSetting.mockReturnValue(true);
  mockWait.mockResolvedValue({ error: false });
  record = { id: '100', typename: 'Feature', referenceNum: 'ABC-1', loadAttributes } as unknown as ExtensionRecord;
});

it.each([false, undefined])('does not load or dispatch when setting is %p', async setting => {
  getSetting.mockReturnValue(setting);
  await syncCaseReferences(record, [12], 'add');
  expect(loadAttributes).not.toHaveBeenCalled();
  expect(mockWait).not.toHaveBeenCalled();
});

it('does nothing for an empty batch', async () => {
  await syncCaseReferences(record, [], 'add');
  expect(getSetting).not.toHaveBeenCalled();
  expect(mockWait).not.toHaveBeenCalled();
});

it.each(['Feature', 'Requirement', 'Epic', 'Iteration'])('loads and uses the reference of a %s', async typename => {
  Object.assign(record, { typename, referenceNum: undefined });
  loadAttributes.mockImplementation(async () => { Object.assign(record, { referenceNum: 'ABC-1' }); });
  await syncCaseReferences(record, [12, 12, 13], 'add');
  expect(loadAttributes).toHaveBeenCalledWith('referenceNum');
  expect(mockWait).toHaveBeenCalledTimes(2);
  expect(mockWait).toHaveBeenNthCalledWith(1, expect.objectContaining({
    args: { caseId: 12, reference: 'ABC-1', operation: 'add' },
  }));
  expect(mockWait).toHaveBeenNthCalledWith(2, expect.objectContaining({
    args: { caseId: 13, reference: 'ABC-1', operation: 'add' },
  }));
  const { lambdaFunc, args, eventKey } = mockWait.mock.calls[0][0];
  await lambdaFunc({ ...args, eventKey });
  expect(triggerServer).toHaveBeenCalledWith(`${IDENTIFIER}.syncCaseReference`, { ...args, eventKey });
});

it('sends removals through the same handler', async () => {
  await syncCaseReferences(record, [12], 'remove');
  expect(mockWait).toHaveBeenCalledWith(expect.objectContaining({
    args: { caseId: 12, reference: 'ABC-1', operation: 'remove' },
  }));
});

it('gives repeated requests independent result fields', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(123);
  try {
    await syncCaseReferences(record, [12], 'add');
    await syncCaseReferences(record, [12], 'remove');
    expect(mockWait.mock.calls[0][0].eventKey).not.toBe(mockWait.mock.calls[1][0].eventKey);
  } finally {
    jest.restoreAllMocks();
  }
});

it('surfaces errors and stops the batch', async () => {
  mockWait.mockResolvedValueOnce({ error: true, message: 'Permission denied' });
  await expect(syncCaseReferences(record, [12, 13], 'add')).rejects.toThrow('Permission denied');
  expect(mockWait).toHaveBeenCalledTimes(1);
});

it('rejects a missing result', async () => {
  mockWait.mockResolvedValueOnce(undefined);
  await expect(syncCaseReferences(record, [12], 'add')).rejects.toThrow('Could not sync reference');
});

it('does not dispatch an empty Aha! reference', async () => {
  Object.assign(record, { referenceNum: '' });
  await expect(syncCaseReferences(record, [12], 'add')).rejects.toThrow('Could not load');
  expect(mockWait).not.toHaveBeenCalled();
});
