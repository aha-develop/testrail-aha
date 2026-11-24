import { Test, TestCase, TestRun } from '../../extension';
import { fieldName, getAccountExtensionFieldMap, getRecords } from './queries';
import saveChunked, { MAX_FIELDS_PER_SAVE } from './saveChunked';

// We need to check runs before the latest for results in case the latest is 'untested'.
// A limit of 20 is used as a more-than-sufficient margin.
export const LATEST_TESTED_RUN_SEARCH_LIMIT = 20;
const UNTESTED_STATUS_ID = 3; // Constant in all TestRail accounts

export type LatestTestedCaseIndex = {
  initialized: boolean;
  latest: { testId: number; runId: number } | null;
};

export const syncedLatestCaseKey = (caseId: number): string =>
  `case_${caseId}_syncedLatest`;

export const localLatestCaseKey = (caseId: number): string =>
  `case_${caseId}_localLatest`;

function createFetchQueue() {
  let pending: Promise<unknown> = Promise.resolve();

  return function <T>(work: () => Promise<T>): Promise<T> {
    const result = pending.then(work);
    pending = result.catch(() => undefined);
    return result;
  };
}

// To support historic data and make the UI more responsive, we track both discovered (local)
// and synced results. The discovery check only happens once, as synced data will almost always be more
// up-to-date.
const withDiscoveryLock = createFetchQueue();
const withSyncLock = createFetchQueue();

const isTested = (test: Test): boolean =>
  typeof test.statusId === 'number' && test.statusId !== UNTESTED_STATUS_ID;

const suiteKey = (record: TestCase | TestRun): string =>
  `${record.projectId}_${record.suiteId}`;

// Read metadata in descending-ID batches rather than loading every historical
// run. Cases in the same suite share the same bounded list of candidate runs.
async function getCandidateRuns(
  cases: TestCase[]
): Promise<Map<string, TestRun[]>> {
  const groups = new Map<string, TestRun[]>();

  for (const testCase of cases) {
    groups.set(suiteKey(testCase), []);
  }

  const projectIds = [...new Set(cases.map(testCase => testCase.projectId))];
  const indexes = await getAccountExtensionFieldMap<number[]>(
    projectIds.map(id => `project_${id}_runIds`)
  );

  const remaining = new Map(
    projectIds.map(id => [
      id,
      [...new Set(indexes[`project_${id}_runIds`] ?? [])].sort((a, b) => b - a),
    ])
  );

  while (remaining.size > 0) {
    const ids: number[] = [];

    for (const [projectId, runIds] of remaining) {
      const needsRuns = cases.some(
        testCase =>
          testCase.projectId === projectId &&
          groups.get(suiteKey(testCase)).length < LATEST_TESTED_RUN_SEARCH_LIMIT
      );

      if (!needsRuns || !runIds.length) {
        remaining.delete(projectId);
      } else {
        ids.push(...runIds.splice(0, MAX_FIELDS_PER_SAVE));
      }
    }

    if (ids.length <= 0) break;

    const runRecords = await getRecords<TestRun>(ids, 'TestRun');

    for (const run of runRecords) {
      const group = groups.get(suiteKey(run));

      if (group && group.length < LATEST_TESTED_RUN_SEARCH_LIMIT) {
        group.push(run);
      }
    }
  }

  return groups;
}

export function getLatestTestedTestsForCases(
  cases: TestCase[]
): Promise<Record<number, Test>> {
  if (!cases.length) return Promise.resolve({});

  return withDiscoveryLock(async () => {
    const uniqueCases = [
      ...new Map(cases.map(testCase => [testCase.id, testCase])).values(),
    ];

    const indexes = await getAccountExtensionFieldMap<LatestTestedCaseIndex>(
      uniqueCases.flatMap(testCase => [
        syncedLatestCaseKey(testCase.id),
        localLatestCaseKey(testCase.id),
      ])
    );

    const recordKeys = Object.values(indexes).flatMap(index =>
      index.latest
        ? [
            fieldName('Test', index.latest.testId),
            fieldName('TestRun', index.latest.runId),
          ]
        : []
    );

    const records = await getAccountExtensionFieldMap<Test | TestRun>([
      ...new Set(recordKeys),
    ]);

    const tests: Record<number, Test> = {};
    const needsDiscovery: TestCase[] = [];

    const validTest = (
      index: LatestTestedCaseIndex | undefined,
      testCase: TestCase
    ): Test | undefined => {
      const latest = index?.latest;
      const test = latest
        ? (records[fieldName('Test', latest.testId)] as Test)
        : undefined;

      const run = latest
        ? (records[fieldName('TestRun', latest.runId)] as TestRun)
        : undefined;

      const valid =
        test &&
        run &&
        test.caseId === testCase.id &&
        test.runId === run.id &&
        suiteKey(run) === suiteKey(testCase) &&
        isTested(test);

      return valid ? test : undefined;
    };

    for (const testCase of uniqueCases) {
      const syncedTest = validTest(
        indexes[syncedLatestCaseKey(testCase.id)],
        testCase
      );
      const localIndex = indexes[localLatestCaseKey(testCase.id)];
      const localTest = validTest(localIndex, testCase);

      if (syncedTest) {
        tests[testCase.id] =
          localTest && localTest.runId > syncedTest.runId
            ? localTest
            : syncedTest;
        continue;
      }

      if (localTest) tests[testCase.id] = localTest;

      if (!localIndex?.initialized || (localIndex.latest && !localTest)) {
        needsDiscovery.push(testCase);
      }
    }

    if (!needsDiscovery.length) return tests;

    const groups = await getCandidateRuns(needsDiscovery);
    const runs = [...groups.values()].flat();
    const runTests = await getAccountExtensionFieldMap<number[]>(
      runs.map(run => `run_${run.id}_testIds`)
    );

    const testIds = [...new Set(Object.values(runTests).flat())];
    const candidates = await getRecords<Test>(testIds, 'Test');
    const runMap = new Map(runs.map(run => [run.id, run]));
    const caseMap = new Map(
      needsDiscovery.map(testCase => [testCase.id, testCase])
    );

    for (const test of candidates) {
      const testCase = caseMap.get(test.caseId);
      const run = runMap.get(test.runId);

      if (
        !testCase ||
        !run ||
        suiteKey(run) !== suiteKey(testCase) ||
        !isTested(test)
      ) {
        continue;
      }

      if (!tests[test.caseId] || test.runId > tests[test.caseId].runId) {
        tests[test.caseId] = test;
      }
    }

    await saveChunked(
      needsDiscovery.map(testCase => {
        const test = tests[testCase.id];

        return [
          localLatestCaseKey(testCase.id),
          {
            initialized: true,
            latest: test ? { testId: test.id, runId: test.runId } : null,
          },
        ];
      })
    );

    return tests;
  });
}

// Updates the synced latest tested case indexes based on the given tests.
export function updateLatestTestedCaseIndexes(tests: Test[]): Promise<void> {
  if (!tests.length) return Promise.resolve();

  return withSyncLock(async () => {
    const keys = [
      ...new Set(tests.map(test => syncedLatestCaseKey(test.caseId))),
    ];

    const indexes =
      await getAccountExtensionFieldMap<LatestTestedCaseIndex>(keys);

    const updates: Record<string, LatestTestedCaseIndex> = {};
    const testsById = new Map(tests.map(test => [test.id, test]));

    for (const key of keys) {
      const index = indexes[key];
      if (!index) continue;

      const winner = index.latest && testsById.get(index.latest.testId);
      if (winner && !isTested(winner)) {
        updates[key] = { initialized: false, latest: null };
      }
    }

    for (const test of tests) {
      const key = syncedLatestCaseKey(test.caseId);
      const index = updates[key] ?? indexes[key];

      if (!isTested(test)) continue;

      if (!index?.latest || test.runId > index.latest.runId) {
        updates[key] = {
          initialized: true,
          latest: { testId: test.id, runId: test.runId },
        };
      }
    }

    await saveChunked(Object.entries(updates));
  });
}
