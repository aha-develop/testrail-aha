import { IDENTIFIER, Test, TestCase, TestRun } from '../../extension';
import queryExtensionFields from './queryExtensionFields';
import {
  getLatestTestedTestsForCases,
  latestTestedCaseKey,
  LATEST_TESTED_RUN_SEARCH_LIMIT,
  updateLatestTestedCaseIndexes,
} from './latestTestedCases';
import { saveRecords } from './updates';
import { updateReferences } from '../sync/updateReferences';

jest.mock('./queryExtensionFields', () => ({ default: jest.fn() }));
jest.mock('../sync/updateReferences', () => ({
  updateReferences: jest.fn(),
}));

let fields: Record<string, any>;
const query = queryExtensionFields as jest.Mock;
const write = jest.fn();
const triggerServer = jest.fn();
const copy = (value: any) => JSON.parse(JSON.stringify(value));

const testCase = (id = 1, suiteId = 1, projectId = 1): TestCase => ({
  kind: 'TestCase',
  id,
  suiteId,
  projectId,
  title: `Case ${id}`,
  createdOn: 0,
});
function run(id: number, suiteId = 1, projectId = 1): TestRun {
  const record: TestRun = {
    kind: 'TestRun',
    id,
    suiteId,
    projectId,
    name: `Run ${id}`,
    createdOn: 1000 - id,
    completed: false,
  };
  fields[`run_${id}`] = record;
  const key = `project_${projectId}_runIds`;
  fields[key] = [...(fields[key] ?? []), id];
  return record;
}
function test(id: number, runId: number, statusId = 1, caseId = 1): Test {
  const record: Test = { kind: 'Test', id, runId, caseId, statusId };
  fields[`test_${id}`] = record;
  const key = `run_${runId}_testIds`;
  fields[key] = [...(fields[key] ?? []), id];
  return record;
}
const queriedKeys = () => query.mock.calls.flatMap(([names]) => names);

beforeEach(() => {
  fields = {};
  jest.resetAllMocks();
  query.mockImplementation(async (names: string[]) =>
    names
      .filter(name => fields[name] !== undefined)
      .map(name => ({ name, value: copy(fields[name]) }))
  );
  write.mockImplementation(async (_identifier, values) =>
    Object.assign(fields, copy(values))
  );
  (global as any).aha = {
    account: { setExtensionFields: write },
    triggerServer,
  };
});

afterEach(() => {
  expect(triggerServer).not.toHaveBeenCalled();
  expect(updateReference).not.toHaveBeenCalled();
});

it('selects T2 over failed T1 and Untested T3 by run ID, not Test ID or creation time', async () => {
  [1, 2, 3].forEach(id => run(id));
  test(900, 1, 5);
  const expected = test(200, 2, 1);
  test(300, 3, 3);

  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: expected,
  });
  expect(fields[latestTestedCaseKey(1)]).toEqual({
    initialized: true,
    latest: { testId: 200, runId: 2 },
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(IDENTIFIER, {
    [latestTestedCaseKey(1)]: {
      initialized: true,
      latest: { testId: 200, runId: 2 },
    },
  });
});

it('batches discovery for cases sharing runs and accepts custom tested statuses', async () => {
  run(1);
  const first = test(1, 1, 6, 1);
  const second = test(2, 1, 2, 2);
  expect(
    await getLatestTestedTestsForCases([testCase(1), testCase(2), testCase(1)])
  ).toEqual({ 1: first, 2: second });
  expect(queriedKeys().filter(key => key === 'project_1_runIds')).toHaveLength(
    1
  );
  expect(queriedKeys().filter(key => key === 'run_1_testIds')).toHaveLength(1);
  expect(query).toHaveBeenCalledWith(['test_1', 'test_2']);
  expect(write).toHaveBeenCalledTimes(1);
});

it('checks exactly the 20 newest matching runs, including runs without the case', async () => {
  expect(LATEST_TESTED_RUN_SEARCH_LIMIT).toBe(20);
  for (let id = 1; id <= 21; id++) run(id);
  test(1, 1, 1, 1); // Just outside the window.
  const boundary = test(2, 2, 1, 2); // Twentieth run, inclusive.
  // Higher IDs in another suite/project must not consume the budget or qualify.
  run(100, 2);
  test(100, 100, 1, 1);
  run(200, 1, 2);
  test(200, 200, 1, 1);

  expect(
    await getLatestTestedTestsForCases([testCase(1), testCase(2)])
  ).toEqual({ 2: boundary });
  expect(fields[latestTestedCaseKey(1)]).toEqual({
    initialized: true,
    latest: null,
  });
  expect(queriedKeys()).not.toContain('run_1_testIds');
  expect(queriedKeys()).not.toContain('run_100_testIds');
  expect(queriedKeys()).not.toContain('run_200');
  expect(queriedKeys()).not.toContain('test_1');
  expect(
    queriedKeys().filter(key => /^run_\d+_testIds$/.test(key))
  ).toHaveLength(20);
});

it('does not load every historical run record in a large project', async () => {
  for (let id = 1; id <= 1000; id++) run(id);
  const expected = test(1, 1000);
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: expected,
  });
  expect(queriedKeys().filter(key => /^run_\d+$/.test(key))).toHaveLength(100);
  expect(
    queriedKeys().filter(key => /^run_\d+_testIds$/.test(key))
  ).toHaveLength(20);
});

it('continues metadata batches when the desired suite has older runs', async () => {
  run(1);
  for (let id = 2; id <= 110; id++) run(id, 2);
  const expected = test(1, 1);
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: expected,
  });
  expect(queriedKeys().filter(key => /^run_\d+_testIds$/.test(key))).toEqual([
    'run_1_testIds',
  ]);
});

it('caches a miss and does not repeat discovery for Untested-only cases', async () => {
  run(1);
  test(1, 1, 3);
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({});
  query.mockClear();
  write.mockClear();
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({});
  expect(queriedKeys()).toEqual([latestTestedCaseKey(1)]);
  expect(write).not.toHaveBeenCalled();
});

it('caches a miss for an empty project and performs no work for no cases', async () => {
  expect(await getLatestTestedTestsForCases([])).toEqual({});
  expect(query).not.toHaveBeenCalled();
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({});
  expect(fields[latestTestedCaseKey(1)]).toEqual({
    initialized: true,
    latest: null,
  });
});

it('reuses the cached winner but reads its current Test status', async () => {
  run(1);
  test(1, 1);
  await getLatestTestedTestsForCases([testCase()]);
  fields.test_1.statusId = 5;
  query.mockClear();
  write.mockClear();
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: fields.test_1,
  });
  expect(queriedKeys()).toEqual([latestTestedCaseKey(1), 'test_1', 'run_1']);
  expect(write).not.toHaveBeenCalled();
});

it.each(['test', 'run', 'status'])(
  'rediscovers when a cached winner has an invalid %s',
  async invalid => {
    run(1);
    run(2);
    const older = test(1, 1);
    test(2, 2);
    await getLatestTestedTestsForCases([testCase()]);
    if (invalid === 'test') delete fields.test_2;
    if (invalid === 'run') delete fields.run_2;
    if (invalid === 'status') fields.test_2.statusId = 3;
    expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
      1: older,
    });
  }
);

it('does not mark failed discovery initialized and retries on the next view', async () => {
  run(1);
  const expected = test(1, 1);
  write.mockRejectedValueOnce(new Error('Save failed'));
  await expect(getLatestTestedTestsForCases([testCase()])).rejects.toThrow(
    'Save failed'
  );
  expect(fields[latestTestedCaseKey(1)]).toBeUndefined();
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: expected,
  });
});

it('deduplicates concurrent discovery for the same case', async () => {
  run(1);
  test(1, 1);
  await Promise.all([
    getLatestTestedTestsForCases([testCase()]),
    getLatestTestedTestsForCases([testCase()]),
  ]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(queriedKeys().filter(key => key === 'run_1_testIds')).toHaveLength(1);
});

it('maintains an initialized miss through the normal saveRecords path', async () => {
  run(1);
  test(1, 1, 3);
  await getLatestTestedTestsForCases([testCase()]);
  const updated: Test = { ...fields.test_1, statusId: 1 };
  await saveRecords([updated]);
  query.mockClear();
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: updated,
  });
  expect(queriedKeys()).not.toContain('project_1_runIds');
});

it('keeps the newest tested run across sync batches and ignores newer Untested runs', async () => {
  fields[latestTestedCaseKey(1)] = {
    initialized: true,
    latest: { testId: 2, runId: 2 },
  };
  await updateLatestTestedCaseIndexes([
    test(300, 3, 3),
    test(900, 1, 5),
    test(4, 4, 6),
    test(2, 2, 5),
  ]);
  expect(fields[latestTestedCaseKey(1)].latest).toEqual({
    testId: 4,
    runId: 4,
  });
  write.mockClear();
  await updateLatestTestedCaseIndexes([test(300, 3, 1), test(5, 5, 3)]);
  expect(write).not.toHaveBeenCalled();
});

it('does not create indexes for unviewed cases during sync', async () => {
  await updateLatestTestedCaseIndexes([test(1, 1)]);
  expect(write).not.toHaveBeenCalled();
  expect(fields[latestTestedCaseKey(1)]).toBeUndefined();
});

it('invalidates an Untested winner and discovers an older result on demand', async () => {
  run(1);
  run(2);
  const older = test(1, 1);
  test(2, 2);
  await getLatestTestedTestsForCases([testCase()]);
  await saveRecords([{ ...fields.test_2, statusId: 3 }]);
  expect(fields[latestTestedCaseKey(1)]).toEqual({
    initialized: false,
    latest: null,
  });
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: older,
  });
});

it('preserves known winners outside the discovery window', async () => {
  run(1);
  const expected = test(1, 1);
  await getLatestTestedTestsForCases([testCase()]);
  for (let id = 2; id <= 30; id++) run(id);
  await saveRecords([test(30, 30, 3)]);
  expect(await getLatestTestedTestsForCases([testCase()])).toEqual({
    1: expected,
  });
});

it('does not lose a sync update that overlaps discovery of a miss', async () => {
  run(1);
  test(1, 1, 3);
  let release: () => void;
  let started: () => void;
  const writeStarted = new Promise<void>(resolve => {
    started = resolve;
  });
  const holdWrite = new Promise<void>(resolve => {
    release = resolve;
  });
  write.mockImplementationOnce(async (_identifier, values) => {
    started();
    await holdWrite;
    Object.assign(fields, copy(values));
  });
  const discovery = getLatestTestedTestsForCases([testCase()]);
  await writeStarted;
  const updated = { ...fields.test_1, statusId: 1 };
  const sync = saveRecords([updated]);
  release();
  await Promise.all([discovery, sync]);
  expect(fields[latestTestedCaseKey(1)]).toEqual({
    initialized: true,
    latest: { testId: 1, runId: 1 },
  });
});

it('chunks large index updates at the existing 500-field write limit', async () => {
  const tests = Array.from({ length: 501 }, (_, index) => {
    const id = index + 1;
    fields[latestTestedCaseKey(id)] = { initialized: true, latest: null };
    return test(id, 1, 1, id);
  });
  await updateLatestTestedCaseIndexes(tests);
  expect(query).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(2);
  expect(Object.keys(write.mock.calls[0][1])).toHaveLength(500);
  expect(Object.keys(write.mock.calls[1][1])).toHaveLength(1);
});
