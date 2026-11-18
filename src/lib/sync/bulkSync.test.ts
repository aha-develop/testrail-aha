import { IDENTIFIER, TestRun } from '../../extension';
import bulkSync, { getSyncKey, SyncStage, SyncState, SyncType } from './bulkSync';
import { waitForIndexedLambda, waitForPagedLambda } from './interface';
import queryExtensionFields from '../extensionFields/queryExtensionFields';

// Keep run discovery, persistence, and both child stages real. Mock only the
// remote transport/storage boundaries and unrelated metadata stages.
jest.mock('./interface', () => ({
  waitForIndexedLambda: jest.fn(),
  waitForPagedLambda: jest.fn(),
}));
jest.mock('../extensionFields/queryExtensionFields', () => ({
  __esModule: true, default: jest.fn(),
}));
jest.mock('./syncStatuses', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./syncProjects', () => ({
  __esModule: true, default: jest.fn(async () => [{ id: 1 }]),
}));
jest.mock('./syncSuites', () => ({
  __esModule: true, default: jest.fn(async () => [{ id: 1, projectId: 1 }]),
}));
jest.mock('./syncSections', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./syncCases', () => ({ __esModule: true, default: jest.fn() }));

const completedRun: TestRun = {
  id: 10, kind: 'TestRun', projectId: 1, suiteId: 1,
  name: 'Completed run', createdOn: 1, completed: true,
};
const watermark = 100000;
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

type Failure = 'before-tests' | 'test-fetch' | 'test-write' | 'test-index'
  | 'result-fetch' | 'result-write' | 'marker-write';

describe('completed run recovery', () => {
  let fields: { [key: string]: any };
  let standaloneRuns: TestRun[];
  let planRuns: TestRun[];
  let openPlanRuns: TestRun[];
  let openRuns: TestRun[];
  let failure: Failure;
  let testRequests: number[];
  let resultRequests: { runId: number; createdAfter?: number }[];
  const originalWindow = global.window;

  const sync = (getLatest = true, type = SyncType.All) => bulkSync({
    domain: 'test', type, getLatest, syncDelay: 0,
    updateState: jest.fn(), setShouldWait: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = {
      state: SyncState.Complete, stage: SyncStage.Results,
      startedAt: 0, lastSync: watermark, progress: 100,
    };
    fields = {
      projectIds: [1], project_1_suiteIds: [1], ignoredSuites: [],
      bulkSyncState: copy(state), testSyncState: copy(state),
    };
    standaloneRuns = [];
    planRuns = [];
    openPlanRuns = [];
    openRuns = [];
    failure = undefined;
    testRequests = [];
    resultRequests = [];
    (global as any).window = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    (global as any).aha = {
      account: {
        getExtensionField: jest.fn(async (_identifier, key) => copy(fields[key])),
        setExtensionField: jest.fn(async (_identifier, key, value) => {
          if (failure === 'before-tests' && value?.stage === SyncStage.Tests
            && value.state === SyncState.Running) throw new Error('State write failed');
          fields[key] = copy(value);
        }),
        setExtensionFields: jest.fn(async (_identifier, values) => {
          const keys = Object.keys(values);
          if (
            (failure === 'test-write' && keys.some(key => /^test_\d+$/.test(key))) ||
            (failure === 'test-index' && keys.some(key => /_testIds$/.test(key))) ||
            (failure === 'result-write' && keys.some(key => /_comment$/.test(key))) ||
            (failure === 'marker-write' && Object.values(values).some((v: any) => v.childrenSynced))
          ) throw new Error('Persistence failed');
          Object.assign(fields, copy(values));
        }),
      },
      triggerServer: jest.fn(),
    };
    (queryExtensionFields as jest.Mock).mockImplementation(async names =>
      names.filter(name => fields[name] !== undefined)
        .map(name => ({ name, value: copy(fields[name]) }))
    );
    (waitForPagedLambda as jest.Mock).mockImplementation(async ({ eventKey, ids }) => {
      if (eventKey.startsWith('syncCompletedRuns-')) return copy(standaloneRuns);
      if (eventKey.startsWith('syncCompletedPlans-')) return planRuns.length ? [100] : [];
      if (eventKey.startsWith('syncPlanRuns-')) return copy(ids[0] === 200 ? openPlanRuns : planRuns);
      throw new Error(`Unexpected request: ${eventKey}`);
    });
    (waitForIndexedLambda as jest.Mock).mockImplementation(async props => {
      if (props.eventKey.startsWith('syncPlans-')) return openPlanRuns.length ? [200] : [];
      if (props.args.isCompleted === 0) return copy(openRuns);
      const ids = Array.from({ length: props.numIds }, (_, i) => props.argFunc(i).runId);
      if (props.eventKey.startsWith('syncTests-')) {
        testRequests.push(...ids);
        if (failure === 'test-fetch') throw new Error('Tests unavailable');
        return ids.map(runId => ({
          id: runId * 10, kind: 'Test', runId, caseId: 1, statusId: 1,
        }));
      }
      if (props.eventKey.startsWith('syncRuns-')) {
        resultRequests.push(...ids.map(runId => ({ runId, createdAfter: props.args.createdAfter })));
        if (failure === 'result-fetch') throw new Error('Results unavailable');
        // This historical result must not be excluded by the global watermark.
        return props.args.createdAfter ? [] : ids.map(runId => ({
          id: runId * 100, kind: 'TestResult', testId: runId * 10,
          comment: 'Historical result', createdOn: 1,
        }));
      }
      throw new Error(`Unexpected request: ${props.eventKey}`);
    });
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    jest.restoreAllMocks();
  });

  describe.each(['standalone', 'plan', 'open plan'])('%s runs', origin => {
    it.each<Failure>([
      'before-tests', 'test-fetch', 'test-write', 'test-index',
      'result-fetch', 'result-write', 'marker-write',
    ])('retries after %s fails and skips only after successful recovery', async point => {
      if (origin === 'standalone') standaloneRuns = [completedRun];
      else if (origin === 'open plan') openPlanRuns = [completedRun];
      else planRuns = [completedRun];
      const type = origin === 'standalone' ? SyncType.All : SyncType.Tests;
      failure = point;

      await sync(true, type);
      expect(fields[getSyncKey(type)].state).toBe(SyncState.Errored);
      expect(fields[getSyncKey(type)].lastSync).toBe(watermark);
      expect(fields.run_10.completed).toBe(true);
      expect(fields.run_10.childrenSynced).not.toBe(true);

      failure = undefined;
      testRequests = [];
      resultRequests = [];
      await sync(true, type);

      expect(testRequests).toEqual([10]);
      expect(resultRequests).toEqual([{ runId: 10, createdAfter: undefined }]);
      expect(fields.test_100.statusId).toBe(1);
      expect(fields.run_10_testIds).toEqual([100]);
      expect(fields.test_100_comment.comment).toBe('Historical result');
      expect(fields.run_10.childrenSynced).toBe(true);
      expect(fields[getSyncKey(type)].state).toBe(SyncState.Complete);

      testRequests = [];
      resultRequests = [];
      await sync(true, type);
      expect(testRequests).toEqual([]);
      expect(resultRequests).toEqual([]);
    });
  });

  it.each([SyncType.All, SyncType.Tests])('skips synced completed children of open plans across syncs (type=%s)', async type => {
    const syncedRun = { ...completedRun, childrenSynced: true };
    const openRun = { ...completedRun, id: 20, completed: false };
    const legacyRun = { ...completedRun, id: 30 };
    const unfinishedRun = { ...completedRun, id: 40 };
    fields.run_10 = copy(syncedRun);
    fields.run_30 = copy(legacyRun);
    fields.run_40 = { ...unfinishedRun, childrenSynced: false };
    openPlanRuns = [completedRun, openRun, legacyRun, unfinishedRun];

    await sync(true, type);

    expect(testRequests).toEqual([20, 30, 40]);
    expect(resultRequests).toEqual([
      { runId: 20, createdAfter: watermark / 1000 },
      { runId: 30, createdAfter: undefined },
      { runId: 40, createdAfter: undefined },
    ]);
    expect(fields.run_10).toEqual(syncedRun);
    expect(fields.run_30.childrenSynced).toBe(true);
    expect(fields.run_40.childrenSynced).toBe(true);
    expect(fields[getSyncKey(type)].state).toBe(SyncState.Complete);

    const lastSync = fields[getSyncKey(type)].lastSync;
    testRequests = [];
    resultRequests = [];
    await sync(true, type);

    expect(testRequests).toEqual([20]);
    expect(resultRequests).toEqual([
      { runId: 20, createdAfter: Math.floor(lastSync / 1000) },
    ]);
    expect(fields.run_10).toEqual(syncedRun);
    expect(fields[getSyncKey(type)].state).toBe(SyncState.Complete);
    const writes = (aha.account.setExtensionFields as jest.Mock).mock.calls;
    expect(writes.every(([, values]) => !('run_10' in values))).toBe(true);
  });

  it('recovers discovered legacy runs, excluding ignored suites', async () => {
    fields.run_10 = copy(completedRun);
    fields.run_20 = { ...completedRun, id: 20, suiteId: 2 };
    fields.project_1_runIds = [10, 20];
    fields.ignoredSuites = [2];
    standaloneRuns = [copy(fields.run_10), copy(fields.run_20)];

    await sync();

    expect(testRequests).toEqual([10]);
    expect(fields.run_10.childrenSynced).toBe(true);
    expect(fields.run_20.childrenSynced).toBeUndefined();
    expect(fields.test_100_comment.comment).toBe('Historical result');
  });

  it.each([
    ['incremental sync', true, SyncType.All],
    ['full resync', false, SyncType.All],
    ['incremental test-only sync', true, SyncType.Tests],
    ['full test-only resync', false, SyncType.Tests],
  ] as const)('%s only loads runs returned by discovery', async (_name, getLatest, type) => {
    // These may be outside the discovery window or deleted remotely. Neither
    // the unfinished nor the fully synced historical record should be loaded.
    fields.run_10 = copy(completedRun);
    fields.run_20 = { ...completedRun, id: 20, childrenSynced: true };
    fields.project_1_runIds = [10, 20];
    standaloneRuns = [{ ...completedRun, id: 30 }];

    await sync(getLatest, type);

    expect(testRequests).toEqual([30]);
    expect(resultRequests).toEqual([{ runId: 30, createdAfter: undefined }]);
    expect(fields.run_30.childrenSynced).toBe(true);
    expect(fields.run_10.childrenSynced).toBeUndefined();
    expect(fields.run_20.childrenSynced).toBe(true);
    expect(fields[getSyncKey(type)].state).toBe(SyncState.Complete);

    const requestedFields = (queryExtensionFields as jest.Mock).mock.calls
      .flatMap(([names]) => names);
    expect(requestedFields).not.toContain('run_10');
    expect(requestedFields).not.toContain('run_20');
  });

  it('preserves incremental result fetching for open runs and deduplicates completed runs', async () => {
    openRuns = [{ ...completedRun, id: 20, completed: false }];
    standaloneRuns = [completedRun];
    planRuns = [completedRun];

    await sync();

    expect(testRequests.sort()).toEqual([10, 20]);
    expect(resultRequests).toEqual([
      { runId: 20, createdAfter: watermark / 1000 },
      { runId: 10, createdAfter: undefined },
    ]);
    expect(fields.run_10.childrenSynced).toBe(true);
    expect(fields.run_20.childrenSynced).toBeUndefined();
  });

  it('marks an empty completed run synced after both empty child responses succeed', async () => {
    standaloneRuns = [completedRun];
    (waitForIndexedLambda as jest.Mock).mockResolvedValue([]);

    await sync();

    expect(fields.run_10.childrenSynced).toBe(true);
    expect(fields.bulkSyncState.state).toBe(SyncState.Complete);
    expect(aha.account.setExtensionFields).toHaveBeenCalledWith(
      IDENTIFIER, { run_10: { ...completedRun, childrenSynced: true } }
    );
  });

  it('does not mark the run synced while result persistence is still pending', async () => {
    standaloneRuns = [completedRun];
    const setFields = aha.account.setExtensionFields as jest.Mock;
    const save = setFields.getMockImplementation();
    let finishWrite: () => void;
    let startedWrite: () => void;
    const started = new Promise<void>(resolve => { startedWrite = resolve; });
    const finish = new Promise<void>(resolve => { finishWrite = resolve; });
    setFields.mockImplementation(async (identifier, values) => {
      if (values.test_100_comment) {
        startedWrite();
        await finish;
      }
      return save(identifier, values);
    });

    const pending = sync();
    await started;
    expect(fields.run_10.childrenSynced).toBeUndefined();
    expect(fields.bulkSyncState.state).toBe(SyncState.Running);

    finishWrite();
    await pending;
    expect(fields.run_10.childrenSynced).toBe(true);
    expect(fields.bulkSyncState.state).toBe(SyncState.Complete);
  });
});
