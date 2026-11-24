import { IDENTIFIER, TestCase } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import { createAndLinkTestCase } from './createAndLinkTestCase';
import { CreateTestCaseResult } from './createTestCase';
import { waitForLambda } from './sync/interface';
import { saveRecords, linkRecord } from './extensionFields/updates';

jest.mock('./sync/interface', () => ({ waitForLambda: jest.fn() }));
jest.mock('./extensionFields/updates', () => ({
  saveRecords: jest.fn(),
  linkRecord: jest.fn(),
}));

const mockWait = waitForLambda as jest.Mock;
const mockSave = saveRecords as jest.Mock;
const mockLink = linkRecord as jest.Mock;
const loadAttributes = jest.fn();
const triggerServer = jest.fn();

const testCase: TestCase = {
  kind: 'TestCase',
  id: 12,
  title: 'New case',
  projectId: 1,
  suiteId: 3,
  createdOn: 123,
};

let createdCase: { current: CreateTestCaseResult | null };
let record: ExtensionRecord;

const props = () => ({
  record,
  domain: 'example',
  title: testCase.title,
  precondition: '',
  steps: '',
  results: '',
  sectionId: '2',
  projectId: '1',
});

beforeEach(() => {
  jest.resetAllMocks();

  // No browser settings API: creation must rely on the server's decision.
  (global as any).aha = { triggerServer };
  createdCase = { current: null };
  record = {
    id: '100',
    typename: 'Feature',
    referenceNum: null,
    loadAttributes,
  } as unknown as ExtensionRecord;

  loadAttributes.mockImplementation(async () => {
    Object.assign(record, { referenceNum: 'ABC-1' });
  });

  mockWait.mockImplementation(async ({ lambdaFunc, args, eventKey }) => {
    await lambdaFunc({ ...args, eventKey });
    return { error: false, result: { ...testCase, referenceHandled: true } };
  });
});

it('sends the loaded reference and links using the server confirmation', async () => {
  await createAndLinkTestCase(props(), createdCase);
  expect(loadAttributes).toHaveBeenCalledWith('referenceNum');
  expect(triggerServer).toHaveBeenCalledTimes(1);

  expect(triggerServer).toHaveBeenCalledWith(
    `${IDENTIFIER}.createTestCase`,
    expect.objectContaining({
      reference: 'ABC-1',
      sectionId: 2,
      projectId: 1,
    })
  );

  expect(mockSave).toHaveBeenCalledWith([testCase]);
  expect(mockLink).toHaveBeenCalledWith(record, 12, 'caseIds', {
    referenceHandled: true,
  });
});

it.each(['save', 'link'])(
  'reuses a created case after a local %s failure',
  async stage => {
    const failingStep = stage === 'save' ? mockSave : mockLink;
    failingStep.mockRejectedValueOnce(new Error('Local save failed'));

    await expect(createAndLinkTestCase(props(), createdCase)).rejects.toThrow(
      'Local save failed'
    );

    expect(createdCase.current).toEqual({
      ...testCase,
      referenceHandled: true,
    });

    await createAndLinkTestCase(props(), createdCase);
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(triggerServer).toHaveBeenCalledTimes(1);
    expect(loadAttributes).toHaveBeenCalledTimes(1);
    expect(mockLink).toHaveBeenLastCalledWith(record, 12, 'caseIds', {
      referenceHandled: true,
    });
  }
);

it('retains reference syncing for older create responses without confirmation', async () => {
  mockWait.mockResolvedValue({ error: false, result: testCase });
  await createAndLinkTestCase(props(), createdCase);

  expect(mockLink).toHaveBeenCalledWith(record, 12, 'caseIds', {
    referenceHandled: false,
  });
});

it('does not create when loading the reference fails', async () => {
  loadAttributes.mockRejectedValue(new Error('Cannot load record'));
  await expect(createAndLinkTestCase(props(), createdCase)).rejects.toThrow(
    'Cannot load record'
  );

  expect(mockWait).not.toHaveBeenCalled();
  expect(mockLink).not.toHaveBeenCalled();
});

it('does not cache or link a failed create and allows retrying creation', async () => {
  mockWait.mockResolvedValueOnce({ error: true, message: 'Invalid reference' });
  await expect(createAndLinkTestCase(props(), createdCase)).rejects.toThrow(
    'Invalid reference'
  );

  expect(createdCase.current).toBeNull();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockLink).not.toHaveBeenCalled();

  await createAndLinkTestCase(props(), createdCase);
  expect(mockWait).toHaveBeenCalledTimes(2);
  expect(mockLink).toHaveBeenCalledTimes(1);
});
