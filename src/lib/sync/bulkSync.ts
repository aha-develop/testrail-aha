import { IDENTIFIER, Project, Suite, TestCase, TestRun } from '../../extension';
import {
  getProjects,
  getSuites,
  getTestCases,
  getTestRuns,
} from '../extensionFields/queries';
import syncStatuses from './syncStatuses';
import syncProjects from './syncProjects';
import syncSuites from './syncSuites';
import syncCases from './syncCases';
import { syncOpenRuns, syncCompletedRuns } from './syncRuns';
import {
  syncOpenPlans,
  syncCompletedPlans,
  syncRunsForPlan,
} from './syncPlans';
import syncTests from './syncTests';
import syncResults from './syncResults';

enum SyncStage {
  Statuses = 0,
  Projects,
  Suites,
  Cases,
  OpenRuns,
  CompletedRuns,
  OpenPlans,
  CompletedPlans,
  RunsForPlan,
  Tests,
  Results,
}

export type SyncLogger = (message: string, error?: boolean) => void;

export type SyncResult = {
  projects?: Project[];
  suites?: Suite[];
  testCases?: TestCase[];
  runs?: TestRun[];
  planIds?: string[];
};

export type SyncProps = {
  domain: string;
  lastCaseSync?: number;
  lastRunSync?: number;
  lastTestSync?: number;
  lastResultSync?: number;
  lastPlanSync?: number;
  result: SyncResult;
  logger: SyncLogger;
  prompter: (
    message: string,
    options?: Aha.CommandPromptOptions
  ) => Promise<any>;
};

type BulkSyncState = {
  stage: SyncStage;
  status: 'pending' | 'running' | 'paused' | 'complete';
  result?: SyncResult;
  lastCaseSync?: number;
  lastRunSync?: number;
  lastTestSync?: number;
  lastResultSync?: number;
  lastPlanSync?: number;
};

// Skip statuses, projects, and suites after the first run - can be run seperately.
const REPEATED_STAGES_START = SyncStage.Cases;
const MAX_STAGE = SyncStage.Results;

const repeatedSyncInitialResult: () => Promise<SyncResult> = async () => {
  const promises = [
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'projectIds'),
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'suiteIds'),
  ];

  const results = await Promise.all(promises);

  const recordPromises = [
    getProjects(results[0] || []),
    getSuites(results[1] || []),
  ];

  const [projects, suites] = await Promise.all(recordPromises);

  return {
    projects,
    suites,
  } as SyncResult;
};

const pauseSync = async () => {
  await aha.account.setExtensionField(IDENTIFIER, 'syncStatus', 'paused');
};

const getBulkSyncState: () => Promise<BulkSyncState> = async () => {
  const promises = [];

  promises.push(aha.account.getExtensionField(IDENTIFIER, 'syncStage'));
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'syncStatus'));
  promises.push(getBulkSyncResult());
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'lastCaseSync'));
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'lastRunSync'));
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'lastTestSync'));
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'lastResultSync'));
  promises.push(aha.account.getExtensionField(IDENTIFIER, 'lastPlanSync'));

  const results = await Promise.all(promises);

  return {
    stage: results[0] ?? 0,
    status: results[1] ?? 'pending',
    result: results[2],
    lastCaseSync: results[3],
    lastRunSync: results[4],
    lastTestSync: results[5],
    lastResultSync: results[6],
    lastPlanSync: results[7],
  };
};

const getBulkSyncResult: () => Promise<SyncResult> = async () => {
  const promises = [];

  promises.push(
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'syncProjectIds')
  );
  promises.push(
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'syncSuiteIds')
  );
  promises.push(
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'syncTestCaseIds')
  );
  promises.push(
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'syncRunIds')
  );
  promises.push(
    aha.account.getExtensionField<string[]>(IDENTIFIER, 'syncPlanIds')
  );

  const result: SyncResult = {};

  const [projectIds, suiteIds, testCaseIds, runIds, planIds] =
    await Promise.all(promises);

  if (planIds) {
    result.planIds = planIds;
  }

  const recordPromises = [];

  if (projectIds) {
    recordPromises.push(
      (async (result, projectIds) => {
        result.projects = await getProjects(projectIds);
      })(result, projectIds)
    );
  }

  if (suiteIds) {
    recordPromises.push(
      (async (result, suiteIds) => {
        result.suites = await getSuites(suiteIds);
      })(result, suiteIds)
    );
  }

  if (testCaseIds) {
    recordPromises.push(
      (async (result, testCaseIds) => {
        result.testCases = await getTestCases(testCaseIds);
      })(result, testCaseIds)
    );
  }

  if (runIds) {
    recordPromises.push(
      (async (result, runIds) => {
        result.runs = await getTestRuns(runIds);
      })(result, runIds)
    );
  }

  await Promise.all(recordPromises);
  return result;
};

// Runs all syncing steps in sequence, to be called by command or as part of a React component.
const bulkSync: (
  logger: SyncLogger,
  prompter: (
    message: string,
    options?: Aha.CommandPromptOptions
  ) => Promise<any>
) => Promise<void> = async (logger, prompter) => {
  try {
    const domain = aha.settings.get(`${IDENTIFIER}.domain`) as string;

    if (!domain) {
      logger(
        'Please configure the extension settings before running bulk sync'
      );
      return;
    }

    const syncState = await getBulkSyncState();
    const {
      stage,
      status,
      lastCaseSync,
      lastRunSync,
      lastTestSync,
      lastResultSync,
      lastPlanSync,
    } = syncState;

    if (status === 'running') {
      logger('Bulk sync is already running. Starting again may cause errors.');

      const retry = await prompter('Are you sure you wish to retry anyway?', {
        placeholder: 'Y/N',
      });

      if (retry.toLowerCase() !== 'y') {
        return;
      }

      await aha.account.setExtensionField(IDENTIFIER, 'syncStage', 0);
    }

    if (status === 'complete') {
      const shouldSkip = await prompter(
        'Would you like to re-fetch statuses, projects, and suites?',
        {
          placeholder: 'Y/N',
        }
      );

      if (shouldSkip.toLowerCase() === 'y') {
        await aha.account.setExtensionField(
          IDENTIFIER,
          'syncStage',
          REPEATED_STAGES_START
        );

        syncState.result = await repeatedSyncInitialResult();
      } else {
        await aha.account.setExtensionField(IDENTIFIER, 'syncStage', 0);
        syncState.result = {};
      }
    }

    if (status !== 'running') {
      await aha.account.setExtensionField(IDENTIFIER, 'syncStatus', 'running');
    }

    window.addEventListener('beforeunload', pauseSync);

    const stages = [
      syncStatuses,
      syncProjects,
      syncSuites,
      syncCases,
      syncOpenRuns,
      syncCompletedRuns,
      syncOpenPlans,
      syncCompletedPlans,
      syncRunsForPlan,
      syncTests,
      syncResults,
    ];

    const input = {
      logger,
      prompter,
      domain,
      lastCaseSync,
      lastRunSync,
      lastTestSync,
      lastResultSync,
      lastPlanSync,
      result: syncState.result,
    };

    for (
      let currentStage = stage;
      currentStage < stages.length;
      currentStage++
    ) {
      const stage = stages[currentStage];

      const stageResult = await stage(input);

      // If null returned, the stage has no sync results
      if (stageResult) {
        input.result = stageResult;
      }

      const promises = [
        saveSyncResult(stageResult, currentStage),
        aha.account.setExtensionField(
          IDENTIFIER,
          'syncStage',
          currentStage + 1
        ),
      ];

      await Promise.all(promises);
    }

    await aha.account.setExtensionField(IDENTIFIER, 'syncStatus', 'complete');
    window.removeEventListener('beforeunload', pauseSync);

    logger('Bulk sync completed successfully');
  } catch (error) {
    logger('An error occurred while running the wizard, aborting', true);
    logger(`Error details: ${error.message}`, true);

    await cleanupBulkSync();
  }
};

const cleanupBulkSync: () => Promise<void> = async () => {
  const promises = [];

  promises.push(aha.account.clearExtensionField(IDENTIFIER, 'syncProjectIds'));
  promises.push(aha.account.clearExtensionField(IDENTIFIER, 'syncSuiteIds'));
  promises.push(aha.account.clearExtensionField(IDENTIFIER, 'syncTestCaseIds'));
  promises.push(aha.account.clearExtensionField(IDENTIFIER, 'syncRunIds'));
  promises.push(aha.account.clearExtensionField(IDENTIFIER, 'syncPlanIds'));
  promises.push(
    aha.account.setExtensionField(IDENTIFIER, 'syncStatus', 'complete')
  );

  await Promise.all(promises);
};

const saveSyncResult: (
  result: SyncResult | null,
  stage: SyncStage
) => Promise<void> = async (result, stage) => {
  if (stage >= MAX_STAGE) {
    return await cleanupBulkSync();
  }

  // Nothing was changed
  if (!result) {
    return;
  }

  switch (stage) {
    case SyncStage.Statuses:
    case SyncStage.Tests:
      // Statuses and Tests aren't used in later stages, ignore
      return;
    case SyncStage.Projects:
      await aha.account.setExtensionField(
        IDENTIFIER,
        'syncProjectIds',
        result.projects.map(project => project.id)
      );
      return;
    case SyncStage.Suites:
      await aha.account.setExtensionField(
        IDENTIFIER,
        'syncSuiteIds',
        result.suites.map(suite => suite.id)
      );
      return;
    case SyncStage.Cases:
      await aha.account.setExtensionField(
        IDENTIFIER,
        'syncTestCaseIds',
        result.testCases.map(testCase => testCase.id)
      );
      return;
    case SyncStage.OpenRuns:
    case SyncStage.CompletedRuns:
    case SyncStage.RunsForPlan:
      await aha.account.setExtensionField(
        IDENTIFIER,
        'syncRunIds',
        result.runs.map(run => run.id)
      );
      return;
    case SyncStage.OpenPlans:
    case SyncStage.CompletedPlans:
      await aha.account.setExtensionField(
        IDENTIFIER,
        'syncPlanIds',
        result.planIds
      );
      return;
  }
};

export default bulkSync;
