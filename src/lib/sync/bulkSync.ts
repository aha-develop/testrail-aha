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
import {
  getAccountExtensionFieldMap,
  indexKeyForKindAndParent,
} from '../extensionFields/queries';

const MAX_RUN_TIME = 60 * 60 * 1000;

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
  syncDelay: number;
  updateState: (state: BulkSyncState) => void;
  setShouldWait: (shouldWait: boolean) => void;
};

type SyncResults = {
  projectIds?: number[];
  projectSuites?: { [projectId: string]: number[] };
  runIds?: number[];
};

type BaseSyncStageProps = {
  domain: string;
  syncState: BulkSyncState;
  setSyncState: (state: BulkSyncState) => Promise<void>;
};

type SyncStageWithRequirementsProps = BaseSyncStageProps & {
  lastSync?: number;
  results: SyncResults;
};

const getSyncState: () => Promise<BulkSyncState> = async () => {
  let syncState = await aha.account.getExtensionField<BulkSyncState>(
    IDENTIFIER,
    'bulkSyncState'
  );

  if (!syncState) {
    syncState = {
      state: SyncState.Pending,
      stage: SyncStage.Statuses,
      progress: 0,
      startedAt: Date.now(),
    };
  }

  return syncState;
};

const getSavedProjectSuites: (
  projectIds: number[]
) => Promise<{ [projectId: string]: number[] }> = async projectIds => {
  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent('Suite', projectId)
  );

  const projectSuites = {};
  const suiteFields = await getAccountExtensionFieldMap<number[]>(keys);

  for (const key in suiteFields) {
    const projectId = key.split('_')[1];

    if (!projectSuites[projectId]) {
      projectSuites[projectId] = [];
    }

    projectSuites[projectId].push(...suiteFields[key]);
  }

  return projectSuites;
};

// Very rough heuristic, getting finer-grained
// progress is very difficult.
const progressForStage: (stage: SyncStage) => number = stage => {
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

const bulkSync: (props: SyncProps) => Promise<void> = async ({
  domain,
  syncDelay,
  updateState,
  setShouldWait,
}) => {
  let syncState = await getSyncState();
  let syncResults: SyncResults = {};

  if (
    syncState.state === SyncState.Running &&
    syncState.startedAt + MAX_RUN_TIME > Date.now()
  ) {
    updateState(syncState);
    return;
  } else if (
    syncState.state === SyncState.Complete &&
    (syncDelay < 0 || syncState.startedAt + syncDelay * 1000 > Date.now())
  ) {
    updateState(syncState);
    return;
  } else if (syncState.lastSync) {
    // Skip statuses/projects/suites on a resync
    const stage = SyncStage.TestCases;
    syncState = { ...syncState, stage, progress: progressForStage(stage) };

    const projectIds = await aha.account.getExtensionField<number[]>(
      IDENTIFIER,
      'projectIds'
    );
    const projectSuites = await getSavedProjectSuites(projectIds);
    syncResults = { projectIds, projectSuites };
  } else {
    syncState = { ...syncState, stage: SyncStage.Statuses, progress: 0 };
  }

  syncState = {
    ...syncState,
    state: SyncState.Running,
    startedAt: Date.now(),
  };

  const setSyncState: (state: BulkSyncState) => Promise<void> = async state => {
    await aha.account.setExtensionField(IDENTIFIER, 'bulkSyncState', state);
    updateState(state);
  };

  // Because we're already calculating and storing the state, the caller
  // doesn't need to wait on sync to finish.
  setShouldWait(false);
  await setSyncState(syncState);

  const failSync = () => {
    const newState = { ...syncState, state: SyncState.Errored };
    setSyncState(newState);
  };

  // If this doesn't fire, we still have the max wait time as a fallback
  window.addEventListener('beforeunload', failSync);

  try {
    if (syncState.stage === SyncStage.Statuses) {
      [syncResults, syncState] = await syncInitialRecords({
        domain,
        syncState,
        setSyncState,
      });
    }

    [syncResults, syncState] = await syncRequiresProjects({
      domain,
      syncState,
      setSyncState,
      results: syncResults,
      lastSync: syncState.lastSync,
    });

    await syncRequiresRuns({
      domain,
      syncState,
      setSyncState,
      lastSync: syncState.lastSync,
      results: syncResults,
    });

    window.removeEventListener('beforeunload', failSync);
  } catch (error) {
    // Handled in the methods, but catch here to skip later stages
  }
};

const syncInitialRecords: (
  props: BaseSyncStageProps
) => Promise<[SyncResults, BulkSyncState]> = async ({
  domain,
  syncState,
  setSyncState,
}) => {
  let newSyncState = { ...syncState };

  try {
    const logger = (_message: string) => {}; // Stub as we don't want descriptive logging in bulk sync

    await syncStatuses({ domain, logger });

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Projects),
      stage: SyncStage.Projects,
    };

    await setSyncState(newSyncState);

    const projects = await syncProjects({ domain, logger });

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Suites),
      stage: SyncStage.Suites,
    };

    await setSyncState(newSyncState);

    const projectIds = projects.map(project => project.id);
    const suiteParams = {
      domain,
      logger,
      projectIds,
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
      progress: progressForStage(SyncStage.Sections),
      stage: SyncStage.Sections,
    };

    await setSyncState(newSyncState);

    const sectionParams = {
      domain,
      logger,
      projectSuites,
    };

    await syncSections(sectionParams);

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.TestCases),
      stage: SyncStage.TestCases,
    };

    await setSyncState(newSyncState);

    return [{ projectIds, projectSuites }, newSyncState];
  } catch (error) {
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

const syncRequiresProjects: (
  props: SyncStageWithRequirementsProps
) => Promise<[SyncResults, BulkSyncState]> = async ({
  domain,
  syncState,
  setSyncState,
  results,
  lastSync,
}) => {
  let newSyncState = { ...syncState };

  try {
    const logger = (_message: string) => {};
    const runs = [];

    const caseParams = {
      domain,
      logger,
      projectSuites: results.projectSuites,
      lastCaseSync: lastSync,
    };

    await syncCases(caseParams);

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.OpenRuns),
      stage: SyncStage.OpenRuns,
    };

    await setSyncState(newSyncState);

    const baseParams = {
      domain,
      logger,
      projectIds: results.projectIds,
    };

    const runParams = { ...baseParams, lastRunSync: lastSync };

    runs.push(...(await syncOpenRuns(runParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.CompletedRuns),
      stage: SyncStage.CompletedRuns,
    };

    await setSyncState(newSyncState);

    runs.push(...(await syncCompletedRuns(runParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.OpenPlans),
      stage: SyncStage.OpenPlans,
    };

    await setSyncState(newSyncState);

    const planParams = { ...baseParams, lastPlanSync: lastSync };

    runs.push(...(await syncOpenPlans(planParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.CompletedPlans),
      stage: SyncStage.CompletedPlans,
    };

    await setSyncState(newSyncState);

    runs.push(...(await syncCompletedPlans(planParams)));

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Tests),
      stage: SyncStage.Tests,
    };

    await setSyncState(newSyncState);

    return [{ ...results, runIds: runs.map(run => run.id) }, newSyncState];
  } catch (error) {
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

const syncRequiresRuns: (
  props: SyncStageWithRequirementsProps
) => Promise<void> = async ({
  domain,
  syncState,
  setSyncState,
  lastSync,
  results,
}) => {
  let newSyncState = { ...syncState };

  try {
    const logger = (_message: string) => {}; // Stub as we don't want descriptive logging in bulk sync

    const testParams = {
      domain,
      logger,
      runIds: results.runIds,
    };

    await syncTests(testParams);

    newSyncState = {
      ...syncState,
      progress: progressForStage(SyncStage.Results),
      stage: SyncStage.Results,
    };

    await setSyncState(newSyncState);

    const resultParams = {
      domain,
      logger,
      lastResultSync: lastSync,
      runIds: results.runIds,
    };

    await syncResults(resultParams);

    newSyncState = {
      ...syncState,
      state: SyncState.Complete,
      progress: 100,
      lastSync: syncState.startedAt,
    };

    await setSyncState(newSyncState);

    await aha.account.setExtensionField(
      IDENTIFIER,
      'lastBulkSync',
      syncState.startedAt
    );
  } catch (error) {
    syncState = { ...newSyncState, state: SyncState.Errored };
    await setSyncState(syncState);

    throw error;
  }
};

export default bulkSync;
