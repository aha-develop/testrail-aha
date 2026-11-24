import { Status, Test, TestCase } from '../extension';
import { getFeatureTabData } from './featureTabData';
import {
  getLinkedComments,
  getRecords,
  getRunRowData,
} from './extensionFields/queries';
import { getLatestTestedTestsForCases } from './extensionFields/latestTestedCases';

jest.mock('./extensionFields/latestTestedCases', () => ({
  getLatestTestedTestsForCases: jest.fn(),
}));

jest.mock('./extensionFields/queries', () => ({
  getRecords: jest.fn(),
  getLinkedComments: jest.fn(),
  getRunRowData: jest.fn(),
}));

const cases: TestCase[] = [1, 2].map(id => ({
  kind: 'TestCase',
  id,
  projectId: 1,
  suiteId: 1,
  title: `Case ${id}`,
  createdOn: 0,
}));

const inferred: Test = {
  kind: 'Test',
  id: 20,
  runId: 2,
  caseId: 2,
  statusId: 5,
};

const explicit: Test = {
  kind: 'Test',
  id: 10,
  runId: 1,
  caseId: 1,
  statusId: 3,
};

const status: Status = {
  kind: 'Status',
  id: 5,
  label: 'Failed',
  colorBright: 0,
  colorMedium: 0,
  colorDark: 0,
};

beforeEach(() => {
  jest.resetAllMocks();
  (getRecords as jest.Mock).mockImplementation(async (_ids, kind) => {
    if (kind === 'TestCase') return cases;
    if (kind === 'Test') return [explicit];
    if (kind === 'Status') return [status];
    return [];
  });

  (getRunRowData as jest.Mock).mockResolvedValue([{}, []]);
  (getLinkedComments as jest.Mock).mockResolvedValue({
    20: { timestamp: 123, comment: 'Failed' },
  });

  (getLatestTestedTestsForCases as jest.Mock).mockResolvedValue({
    2: inferred,
  });
});

it('preserves existing behavior and performs no inference when the setting is off', async () => {
  const data = await getFeatureTabData([1, 2], [], [10]);
  expect(getLatestTestedTestsForCases).not.toHaveBeenCalled();
  expect(data.tests).toEqual({ 1: explicit });
});

it('infers only unlinked cases, preserving explicit Untested links and their IDs', async () => {
  const data = await getFeatureTabData([1, 2], [], [10], true);
  expect(getLatestTestedTestsForCases).toHaveBeenCalledWith([cases[1]]);
  expect(data.tests).toEqual({ 1: explicit, 2: inferred });
  expect(data.linkedTests).toEqual([explicit]);
  expect(getLinkedComments).toHaveBeenCalledWith([10, 20]);
  expect(getRecords).toHaveBeenCalledWith([3, 5], 'Status');
  expect(data.comments[20].comment).toBe('Failed');
  expect(data.statuses[5]).toEqual(status);
});

it('leaves cases without a qualifying result as case-only rows', async () => {
  (getLatestTestedTestsForCases as jest.Mock).mockResolvedValue({});
  const data = await getFeatureTabData([1, 2], [], [10], true);
  expect(data.tests[2]).toBeUndefined();
  expect(data.testCases).toEqual(cases);
});
