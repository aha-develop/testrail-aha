import { IDENTIFIER, TestRailRecord, TestResult } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { fieldName, getAccountExtensionFieldMap } from './queries';

export async function linkTestCase(record: ExtensionRecord, caseId: string) {
  let caseIds = await record.getExtensionField<string[]>(IDENTIFIER, 'caseIds');

  if (!caseIds) caseIds = [];

  if (caseIds.includes(caseId)) return;

  caseIds.push(caseId);

  await record.setExtensionField(IDENTIFIER, 'caseIds', caseIds);
}

export async function unlinkTestCase(record: ExtensionRecord, caseId: string) {
  let caseIds = (await record.getExtensionField(IDENTIFIER, 'caseIds')) as
    | string[]
    | undefined;

  const newCaseIds = caseIds.filter(id => id !== caseId);

  if (newCaseIds.length === caseIds.length) return;

  await record.setExtensionField(IDENTIFIER, 'caseIds', newCaseIds);
}

export const saveRecords: <T extends TestRailRecord>(
  records: T[]
) => Promise<void> = async records => {
  if (records.length === 0) return;

  // Fire off all requests at once to minimize the chance we get dropped part way
  const promises = records.map(record =>
    aha.account.setExtensionField(
      IDENTIFIER,
      fieldName(record.kind, record.id),
      record
    )
  );

  promises.push(updateRecordIndexes(records));

  await Promise.all(promises);
};

const updateRecordIndexes: <T extends TestRailRecord>(
  records: T[]
) => Promise<void> = async records => {
  const keyMap = {};

  for (const record of records) {
    const indexKey = indexKeyForRecord(record);

    if (!keyMap[indexKey]) {
      keyMap[indexKey] = [];
    }

    keyMap[indexKey].push(record);
  }

  const promises = [];

  for (const key in keyMap) {
    promises.push(updateIndex(key, keyMap[key]));
  }

  await Promise.all(promises);
};

const updateIndex: <T extends TestRailRecord>(
  key: string,
  records: T[]
) => Promise<void> = async (key, records) => {
  const existingIds = await aha.account.getExtensionField<string[]>(
    IDENTIFIER,
    key
  );

  const allIds = new Set(
    ...(existingIds || []),
    ...records.map(record => record.id)
  );

  await aha.account.setExtensionField(IDENTIFIER, key, Array.from(allIds));
};

// To minimize the size of the index extension fields, we use multiple indexes
// scoped by parent record.
const indexKeyForRecord: (
  record: TestRailRecord | TestResult
) => string = record => {
  switch (record.kind) {
    case 'Status':
      return `statusIds`;
    case 'Project':
      return `projectIds`;
    case 'Suite':
      return `project_${record.projectId}_suiteIds`;
    case 'TestCase':
      return `project_${record.projectId}_caseIds`;
    case 'TestRun':
      return `project_${record.projectId}_runIds`;
    case 'Test':
      return `run_${record.runId}_testIds`;
    case 'TestResult':
      return `test_${record.testId}_comment`;
  }
};

export const linkResultsToTests = async (results: TestResult[]) => {
  const keyMap = {};

  for (const result of results) {
    const indexKey = indexKeyForRecord(result);

    if (!keyMap[indexKey]) {
      keyMap[indexKey] = [];
    }

    keyMap[indexKey].push(result);
  }

  const commentLinks = await getAccountExtensionFieldMap<{
    timestamp: number;
    comment: string;
  }>(Object.keys(keyMap));

  const promises = [];

  for (const key in keyMap) {
    let best = commentLinks[key];
    let unchanged = true;

    for (const testResult of keyMap[key]) {
      if (best && best.timestamp >= testResult.createdOn) {
        continue;
      }

      unchanged = false;
      best = {
        timestamp: testResult.createdOn,
        comment: testResult.comment,
      };
    }

    if (unchanged) continue;

    promises.push(aha.account.setExtensionField(IDENTIFIER, key, best));
  }

  await Promise.all(promises);
};
