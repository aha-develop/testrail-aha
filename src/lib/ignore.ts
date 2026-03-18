import { IDENTIFIER, Section, Suite, TestCase, TestRun } from '../extension';
import {
  fieldName,
  getAccountExtensionFields,
  getProjectRecords,
  getRecords,
  indexKeyForKindAndParent,
} from './extensionFields/queries';
import { deleteChunked } from './extensionFields/updates';

// Given a list of of ignored suite IDs, find all associated records (Sections, TestCases and TestRuns) and delete their references,
// and mark the suites as ignored. Unfortunately we store records indexed by Project ID, so we have to fetch all records
// for a project and then filter out those with the ignored suite IDs.
//
// We also have no way to delete the links on individual records - those should silently be ignored if they can't be found.
export const deleteIgnoredSuiteRecords: (
  suiteIds: number[]
) => Promise<void> = async suiteIds => {
  if (!suiteIds || suiteIds.length === 0) {
    return;
  }

  const suites = await getRecords<Suite>(suiteIds, 'Suite');

  if (!suites || suites.length === 0) {
    return;
  }

  const projectIds = [...new Set(suites.map(suite => suite.projectId))];

  const sections = await getProjectRecords<Section>(projectIds, 'Section');
  const testCases = await getProjectRecords<TestCase>(projectIds, 'TestCase');
  const testRuns = await getProjectRecords<TestRun>(projectIds, 'TestRun');

  const recordsToDelete = [];
  const indexesToUpdate = {};

  for (const projectId of projectIds) {
    const projectSections = sections[projectId] || [];
    const projectTestCases = testCases[projectId] || [];
    const projectTestRuns = testRuns[projectId] || [];

    const sectionsToKeep = [];
    const testCasesToKeep = [];
    const openRunsToKeep = [];
    const completedRunsToKeep = [];
    const deletedRuns = [];

    for (const section of projectSections) {
      if (suiteIds.includes(section.suiteId)) {
        recordsToDelete.push(fieldName('Section', section.id));
      } else {
        sectionsToKeep.push(section.id);
      }
    }

    for (const testCase of projectTestCases) {
      if (suiteIds.includes(testCase.suiteId)) {
        recordsToDelete.push(fieldName('TestCase', testCase.id));
      } else {
        testCasesToKeep.push(testCase.id);
      }
    }

    for (const testRun of projectTestRuns) {
      if (suiteIds.includes(testRun.suiteId)) {
        deletedRuns.push(testRun.id);
        recordsToDelete.push(fieldName('TestRun', testRun.id));
      } else {
        if (testRun.completed) {
          completedRunsToKeep.push(testRun.id);
        } else {
          openRunsToKeep.push(testRun.id);
        }
      }
    }

    // Only update if there were records in the index to start with
    if (projectSections.length > 0)
      indexesToUpdate[`project_${projectId}_sectionIds`] = sectionsToKeep;
    if (projectTestCases.length > 0)
      indexesToUpdate[`project_${projectId}_caseIds`] = testCasesToKeep;
    if (projectTestRuns.length > 0) {
      indexesToUpdate[`project_${projectId}_openRunIds`] = openRunsToKeep;
      indexesToUpdate[`project_${projectId}_completedRunIds`] = completedRunsToKeep;
    }

    // Delete any tests and results associated with deleted runs
    if (deletedRuns.length > 0) {
      const testIndexes = deletedRuns.map(runId => `run_${runId}_testIds`);
      const testIds = (
        await getAccountExtensionFields<number[]>(testIndexes)
      ).flat();

      for (const testId of testIds) {
        recordsToDelete.push(fieldName('Test', testId));
        recordsToDelete.push(indexKeyForKindAndParent('TestResult', testId));
      }

      recordsToDelete.push(...testIndexes);
    }
  }

  if (recordsToDelete.length > 0) {
    await deleteChunked(recordsToDelete);
  }

  if (Object.keys(indexesToUpdate).length > 0) {
    await aha.account.setExtensionFields(IDENTIFIER, indexesToUpdate);
  }
};
