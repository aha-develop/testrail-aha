import { Status, Test, TestCase, TestRun } from '../extension';
import {
  getLinkedComments,
  getRecords,
  getRunRowData,
} from './extensionFields/queries';
import { getLatestTestedTestsForCases } from './extensionFields/latestTestedCases';

export type FeatureTabData = {
  testCases: TestCase[];
  tests: Record<number, Test>;
  linkedTests: Test[];
  comments: Record<number, { timestamp: number; comment: string }>;
  statuses: Record<number, Status>;
  runs: TestRun[];
  runTestMap: Record<number, [TestCase, Test][]>;
};

export async function getFeatureTabData(
  caseIds: number[] | undefined,
  runIds: number[] | undefined,
  testIds: number[] | undefined,
  showLatestTestedResultForCases = false
): Promise<FeatureTabData> {
  const [testCases, runs, linkedTests] = await Promise.all([
    getRecords<TestCase>(caseIds, 'TestCase'),
    getRecords<TestRun>(runIds, 'TestRun'),
    getRecords<Test>(testIds, 'Test'),
  ]);

  const explicitTests: Record<number, Test> = {};
  for (const test of linkedTests) explicitTests[test.caseId] = test;

  const [inferredTests, [runTestMap, runTests]] = await Promise.all([
    showLatestTestedResultForCases
      ? getLatestTestedTestsForCases(
          testCases.filter(testCase => !explicitTests[testCase.id])
        )
      : Promise.resolve({}),
    getRunRowData(runs.map(run => run.id)),
  ]);

  const tests: Record<number, Test> = { ...inferredTests, ...explicitTests };
  const displayedTests = [...runTests, ...Object.values(tests)];
  const [comments, statuses] = await Promise.all([
    getLinkedComments([...new Set(displayedTests.map(test => test.id))]),
    getRecords<Status>(
      [...new Set(displayedTests.map(test => test.statusId))],
      'Status'
    ),
  ]);

  return {
    testCases,
    tests,
    linkedTests,
    runs,
    runTestMap,
    comments,
    statuses: Object.fromEntries(statuses.map(status => [status.id, status])),
  };
}
