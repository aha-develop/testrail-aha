import { IDENTIFIER } from '../../extension';
import syncStatuses from './syncStatuses';
import syncProjects from './syncProjects';
import syncSuites from './syncSuites';
import syncSections from './syncSections';
import syncCases from './syncCases';
import { syncCompletedPlans, syncOpenPlans } from './syncPlans';
import { syncCompletedRuns, syncOpenRuns } from './syncRuns';
import syncTests from './syncTests';
import syncResults from './syncResults';
import { getProjectSuiteMapping } from '../extensionFields/queries';

const MAX_RUN_TIME = 60 * 60 * 1000;

export enum SyncType {
  All,
  Cases,
  Tests,
}

export enum SyncState {
  Pending,
  Running,
  Errored,
  Complete,
  Timeout,
}

export enum SyncStage {
  Statuses,
  Projects,
  Suites,
  Sections,
  TestCases,
  OpenRuns,
  CompletedRuns,
  OpenPlans,
  CompletedPlans,
  Tests,
  Results,
}

export type BulkSyncState = {
  state: SyncState;
  stage: SyncStage;
  startedAt: number;
  lastSync?: number;
  progress: number;
};

type SyncProps = {
  domain: string;
  type: SyncType;
  syncDelay: number;
  getLatest: boolean;
  updateState: (state: BulkSyncState) => void;
  setShouldWait: (shouldWait: boolean) => void;
};

type SyncResults = {
  projectIds?: number[];
  projectSuites?: { [projectId: string]: number[] };
  runIds?: number[];
  ignoredSuiteIds?: number[];
};

type BaseSyncStageProps = {
  domain: string;
  type: SyncType;
  syncState: BulkSyncState;
  setSyncState: (state: BulkSyncState) => Promise<void>;
};

type SyncStageWithRequirementsProps = BaseSyncStageProps & {
  lastSync?: number;
  results: SyncResults;
};

export const getSyncKey: (type: SyncType) => string = type => {
  switch (type) {
    case SyncType.All:
      return 'bulkSyncState';
    case SyncType.Cases:
      return 'caseSyncState';
    case SyncType.Tests:
      return 'testSyncState';
  }
};

const getInitialStage: (type: SyncType) => SyncStage = type => {
  if (type === SyncType.All) {
    return SyncStage.Statuses;
  }

  return SyncStage.Projects;
};

const getSyncState: (type: SyncType) => Promise<BulkSyncState> = async type => {
  let syncState = await aha.account.getExtensionField<BulkSyncState>(
    IDENTIFIER,
    getSyncKey(type)
  );

  if (!syncState) {
    syncState = {
      state: SyncState.Pending,
      stage: getInitialStage(type),
      progress: 0,
      startedAt: Date.now(),
    };
  }

  return syncState;
};

const progressForStage: (stage: SyncStage, type: SyncType) => number = (
  stage,
  type
) => {
  switch (type) {
    case SyncType.All:
      return progressForBulkSyncStage(stage);
    case SyncType.Cases:
      return progressForCaseSyncStage(stage);
    case SyncType.Tests:
      return progressForTestSyncStage(stage);
  }
};

// Very rough heuristic, getting finer-grained
// progress is very difficult.
const progressForBulkSyncStage: (stage: SyncStage) => number = stage => {
  switch (stage) {
    case SyncStage.Statuses:
      return 0;
    case SyncStage.Projects:
      return 5;
    case SyncStage.Suites:
      return 10;
    case SyncStage.Sections:
      return 15;
    case SyncStage.TestCases:
      return 20;
    case SyncStage.OpenRuns:
      return 30;
    case SyncStage.CompletedRuns:
      return 40;
    case SyncStage.OpenPlans:
      return 45;
    case SyncStage.CompletedPlans:
      return 55;
    case SyncStage.Tests:
      return 60;
    case SyncStage.Results:
      return 80;
  }
};

const progressForCaseSyncStage: (stage: SyncStage) => number = stage => {
  switch (stage) {
    case SyncStage.Projects:
      return 0;
    case SyncStage.Suites:
      return 20;
    case SyncStage.Sections:
      return 40;
    case SyncStage.TestCases:
      return 60;
    default:
      return 100; // Should not be possible
  }
};

const progressForTestSyncStage: (stage: SyncStage) => number = stage => {
  switch (stage) {
    case SyncStage.Projects:
      return 0;
    case SyncStage.OpenRuns:
      return 5;
    case SyncStage.CompletedRuns:
      return 20;
    case SyncStage.OpenPlans:
      return 30;
    case SyncStage.CompletedPlans:
      return 45;
    case SyncStage.Tests:
      return 55;
    case SyncStage.Results:
      return 80;
  }
};

const bulkSync: (props: SyncProps) => Promise<void> = async ({
  domain,
  type,
  syncDelay,
  getLatest,
  updateState,
  setShouldWait,
}) => {
  let syncState = await getSyncState(type);
  let syncResults: SyncResults = {};

  if (
    syncState.state === SyncState.Running &&
    syncState.startedAt + MAX_RUN_TIME > Date.now()
  ) {
    updateState(syncState);
    return;
  } else if (
    syncState.state === SyncState.Complete &&
    syncState.startedAt + syncDelay * 1000 > Date.now()
  ) {
    updateState(syncState);
    return;
  } else if (type === SyncType.All && syncState.lastSync && getLatest) {
    // Skip statuses/projects/suites on a resync
    const stage = SyncStage.TestCases;
    syncState = {
      ...syncState,
      stage,
      progress: progressForBulkSyncStage(stage),
    };

    const projectIds = await aha.account.getExtensionField<number[]>(
      IDENTIFIER,
      'projectIds'
    );

    const ignoredSuites =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'ignoredSuites'
      )) ?? [];

    const projectSuites = await getProjectSuiteMapping(
      projectIds,
      ignoredSuites
    );

    syncResults = {
      projectIds,
      projectSuites,
      ignoredSuiteIds: ignoredSuites,
    };
  } else {
    syncState = { ...syncState, stage: getInitialStage(type), progress: 0 };
  }

  syncState = {
    ...syncState,
    state: SyncState.Running,
    startedAt: Date.now(),
  };

  const setSyncState: (state: BulkSyncState) => Promise<void> = async state => {
    await aha.account.setExtensionField(IDENTIFIER, getSyncKey(type), state);
    updateState(state);
  };

  const failSync = () => {
    const newState = { ...syncState, state: SyncState.Errored };
    setSyncState(newState);
  };

  // If this doesn't fire, we still have the max wait time as a fallback
  window.addEventListener('beforeunload', failSync);

  // Because we're already calculating and storing the state, the caller
  // doesn't need to wait on sync to finish.
  setShouldWait(false);
  await setSyncState(syncState);

  try {
    if (syncState.stage === SyncStage.Statuses || type !== SyncType.All) {
      [syncResults, syncState] = await syncInitialRecords({
        domain,
        type,
        syncState,
        setSyncState,
      });
    }

    [syncResults, syncState] = await syncRequiresProjects({
      domain,
      type,
      syncState,
      setSyncState,
      results: syncResults,
      lastSync: getLatest ? syncState.lastSync : null,
    });

    if (type !== SyncType.Cases)
      await syncRequiresRuns({
        domain,
        type,
        syncState,
        setSyncState,
        lastSync: getLatest ? syncState.lastSync : null,
        results: syncResults,
      });
  } catch (error) {
    // Handled in the methods, but catch here to skip later stages
  } finally {
    window.removeEventListener('beforeunload', failSync);
  }
};

const syncInitialRecords: (
  props: BaseSyncStageProps
) => Promise<[SyncResults, BulkSyncState]> = async ({
  domain,
  type,
  syncState,
  setSyncState,
}) => {
  let newSyncState = { ...syncState };

  try {
    if (syncState.stage === SyncStage.Statuses) {
      await syncStatuses({ domain });

      newSyncState = {
        ...syncState,
        progress: progressForStage(SyncStage.Projects, type),
        stage: SyncStage.Projects,
      };

      await setSyncState(newSyncState);
    }

    const projects = await syncProjects({ domain });

    const ignoredSuites =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'ignoredSuites'
      )) ?? [];

    const ignoredSuiteIds = ignoredSuites;

    let nextStage = SyncStage.Suites;
    if (type === SyncType.Tests) {
      nextStage = SyncStage.OpenRuns;
    }

    newSyncState = {
      ...syncState,
      progress: progressForStage(nextStage, type),
      stage: nextStage,
    };

    await setSyncState(newSyncState);

    if (type === SyncType.Tests) {
      return [
        { projectIds: projects.map(project => project.id) },
        newSyncState,
      ];
    }

    const projectIds = projects.map(project => project.id);
    const suiteParams = {
      domain,
      projectIds,
      ignoredSuiteIds,
    };

    const projectSuites = {};
    const suites = await syncSuites(suiteParams);

    suites.forEach(suite => {
      if (!projectSuites[suite.projectId]) {
        projectSuites[suite.projectId] = [];
      }

      projectSuites[suite.projectId].push(suite.id);
    });

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Sections, type),
      stage: SyncStage.Sections,
    };

    await setSyncState(newSyncState);

    const sectionParams = {
      domain,
      projectSuites,
      ignoredSuiteIds,
    };

    await syncSections(sectionParams);

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.TestCases, type),
      stage: SyncStage.TestCases,
    };

    await setSyncState(newSyncState);

    return [{ projectIds, projectSuites, ignoredSuiteIds }, newSyncState];
  } catch (error) {
    console.log('Error during sync:', error);
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

const syncRequiresProjects: (
  props: SyncStageWithRequirementsProps
) => Promise<[SyncResults, BulkSyncState]> = async ({
  domain,
  type,
  syncState,
  setSyncState,
  results,
  lastSync,
}) => {
  let newSyncState = { ...syncState };

  try {
    const runs = [];

    if (syncState.stage === SyncStage.TestCases) {
      const caseParams = {
        domain,
        projectSuites: results.projectSuites,
        lastCaseSync: lastSync,
        ignoredSuiteIds: results.ignoredSuiteIds,
      };

      await syncCases(caseParams);

      newSyncState = {
        ...syncState,
        progress: progressForStage(SyncStage.OpenRuns, type),
        stage: SyncStage.OpenRuns,
      };
    }

    if (type === SyncType.Cases) {
      await finishSync(syncState, type, setSyncState);
      return [results, newSyncState];
    }

    await setSyncState(newSyncState);

    const baseParams = {
      domain,
      projectIds: results.projectIds,
      ignoredSuiteIds: results.ignoredSuiteIds,
    };

    const runParams = { ...baseParams, lastRunSync: lastSync };

    runs.push(...(await syncOpenRuns(runParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.CompletedRuns, type),
      stage: SyncStage.CompletedRuns,
    };

    await setSyncState(newSyncState);

    runs.push(...(await syncCompletedRuns(runParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.OpenPlans, type),
      stage: SyncStage.OpenPlans,
    };

    await setSyncState(newSyncState);

    const planParams = { ...baseParams, lastPlanSync: lastSync };

    runs.push(...(await syncOpenPlans(planParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.CompletedPlans, type),
      stage: SyncStage.CompletedPlans,
    };

    await setSyncState(newSyncState);

    runs.push(...(await syncCompletedPlans(planParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Tests, type),
      stage: SyncStage.Tests,
    };

    await setSyncState(newSyncState);

    return [{ ...results, runIds: runs.map(run => run.id) }, newSyncState];
  } catch (error) {
    console.log('Error during sync:', error);
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

const syncRequiresRuns: (
  props: SyncStageWithRequirementsProps
) => Promise<void> = async ({
  domain,
  type,
  syncState,
  setSyncState,
  lastSync,
  results,
}) => {
  let newSyncState = { ...syncState };

  try {
    const testParams = {
      domain,
      runIds: results.runIds,
    };

    await syncTests(testParams);

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Results, type),
      stage: SyncStage.Results,
    };

    await setSyncState(newSyncState);

    const resultParams = {
      domain,
      lastResultSync: lastSync,
      runIds: results.runIds,
    };

    await syncResults(resultParams);

    await finishSync(newSyncState, type, setSyncState);
  } catch (error) {
    console.log('Error during sync:', error);
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

const finishSync: (
  syncState: BulkSyncState,
  type: SyncType,
  setSyncState: (state: BulkSyncState) => void
) => void = async (syncState, type, setSyncState) => {
  const newSyncState = {
    ...syncState,
    state: SyncState.Complete,
    progress: 100,
    lastSync: syncState.startedAt,
  };

  await setSyncState(newSyncState);
};

export default bulkSync;
