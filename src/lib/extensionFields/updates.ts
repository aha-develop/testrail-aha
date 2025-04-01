import {
  IDENTIFIER,
  TestRailRecord,
  TestRun,
  TestResult,
} from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import {
  fieldName,
  indexKeyForRecord,
  getAccountExtensionFieldMap,
} from './queries';

const MAX_FIELDS_PER_SAVE = 500;

export const linkRecord: (
  record: ExtensionRecord,
  id: number,
  key: string
) => Promise<void> = async (record, id, key) => {
  let existingIds = await record.getExtensionField<number[]>(IDENTIFIER, key);

  if (!existingIds) existingIds = [];

  if (existingIds.includes(id)) return;

  existingIds.push(id);

  await record.setExtensionField(IDENTIFIER, key, existingIds);
};

export const unlinkRecord: (
  record: ExtensionRecord,
  id: number,
  key: string
) => Promise<void> = async (record, id, key) => {
  let ids = (await record.getExtensionField(IDENTIFIER, key)) as
    | number[]
    | undefined;

  const newIds = ids.filter(existingId => id !== existingId);

  if (newIds.length === ids.length) return;

  await record.setExtensionField(IDENTIFIER, key, newIds);
};

export const saveRecords: <T extends TestRailRecord>(
  records: T[]
) => Promise<void> = async records => {
  if (records.length === 0) return;

  const fields = [];

  for (const record of records) {
    fields.push([fieldName(record.kind, record.id), record]);
  }

  await saveChunked(fields);
  await updateRecordIndexes(records);
};

export const saveNewRuns: (
  records: TestRun[]
) => Promise<TestRun[]> = async records => {
  if (records.length === 0) return [];

  const newRecords = [];

  const keys = records.map(record => fieldName(record.kind, record.id));
  const map = await getAccountExtensionFieldMap<TestRun>(keys);

  // Once a run is completed it no longer changes and can be ignored
  for (const record of records) {
    if (map[fieldName(record.kind, record.id)]?.completed) continue;

    newRecords.push(record);
  }

  await saveRecords<TestRun>(newRecords);

  return newRecords;
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

  const existingIndexes = await getAccountExtensionFieldMap<number[]>(
    Object.keys(keyMap)
  );

  const fields = [];

  for (const key in keyMap) {
    let allIds = existingIndexes[key] ?? [];
    allIds.push(...keyMap[key].map(record => record.id));

    fields.push([key, Array.from(new Set(allIds))]);
  }

  await saveChunked(fields);
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

  const fields: [string, { timestamp: number; comment: string }][] = [];
  let shouldUpdate = false;

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

    shouldUpdate = true;
    fields.push([key, best]);
  }

  if (!shouldUpdate) return;

  await saveChunked(fields);
};

const saveChunked: (
  fields: [string, any][]
) => Promise<void> = async fields => {
  for (let i = 0; i < fields.length; i += MAX_FIELDS_PER_SAVE) {
    const chunk = fields.slice(i, i + MAX_FIELDS_PER_SAVE);
    const chunkFields = Object.fromEntries(chunk);

    await aha.account.setExtensionFields(IDENTIFIER, chunkFields);
  }
};
