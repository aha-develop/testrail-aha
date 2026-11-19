import TestRow from './TestRow';
import { unlinkRecord } from '../../lib/extensionFields/updates';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { Test, TestCase } from '../../extension';

// React is supplied by the extension host, not installed in this repository.
// Capture the element tree so these tests exercise the row's real handlers.
jest.mock('react', () => ({
  default: {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'fragment',
  },
  useState: initial => [initial, jest.fn()],
}), { virtual: true });
jest.mock('../../lib/extensionFields/updates', () => ({ unlinkRecord: jest.fn() }));
jest.mock('../RecordLink', () => ({ default: 'record-link' }));
jest.mock('../modals/LinkTestToTestCase', () => ({ default: 'link-test-modal' }));

const testCase: TestCase = {
  kind: 'TestCase', id: 1, projectId: 1, suiteId: 1, title: 'Case', createdOn: 0,
};
const test: Test = { kind: 'Test', id: 2, caseId: 1, runId: 3, statusId: 1 };
const record = {} as ExtensionRecord;

function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function render(inferred: boolean, selectedTest: Test = test) {
  return elements(TestRow({ testCase, test: selectedTest, inferred, domain: 'example', record }));
}

beforeEach(() => jest.resetAllMocks());

it('unlinks only the case when its displayed Test is inferred', async () => {
  const nodes = render(true);
  await nodes.find(node => node.type === 'aha-button' && node.props.kind === 'icon').props.onClick();
  expect(unlinkRecord).toHaveBeenCalledTimes(1);
  expect(unlinkRecord).toHaveBeenCalledWith(record, 1, 'caseIds');
  expect(nodes.some(node => node.type === 'record-link' && node.props.record === test)).toBe(true);
  expect(nodes.some(node => node.type === 'aha-button' && node.props.kind === 'link')).toBe(true);
});

it('retains unlink behavior for explicitly linked Tests', async () => {
  const nodes = render(false);
  await nodes.find(node => node.type === 'aha-button' && node.props.kind === 'icon').props.onClick();
  expect(unlinkRecord).toHaveBeenNthCalledWith(1, record, 1, 'caseIds');
  expect(unlinkRecord).toHaveBeenNthCalledWith(2, record, 2, 'testIds');
  expect(nodes.some(node => node.type === 'aha-button' && node.props.kind === 'link')).toBe(false);
});

it('keeps the explicit link action available for a case without a result', () => {
  const nodes = render(false, null);
  expect(nodes.some(node => node.type === 'aha-button' && node.props.kind === 'link')).toBe(true);
});
