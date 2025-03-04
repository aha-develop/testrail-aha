import { IDENTIFIER, TestRailRecord, TestResult } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import {
  fieldName,
  indexKeyForRecord,
  getAccountExtensionFieldMap,
} from './queries';

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

export async function unlinkRecord(
  record: ExtensionRecord,
  id: number,
  key: string
) {
  let ids = (await record.getExtensionField(IDENTIFIER, key)) as
    | number[]
    | undefined;

  const newIds = ids.filter(existingId => id !== existingId);

  if (newIds.length === ids.length) return;

  await record.setExtensionField(IDENTIFIER, key, newIds);
}

export const saveRecords: <T extends TestRailRecord>(
  records: T[]
) => Promise<void> = async records => {
  if (records.length === 0) return;

  for (const record of records) {
    await aha.account.setExtensionField(
      IDENTIFIER,
      fieldName(record.kind, record.id),
      record
    );
  }

  await updateRecordIndexes(records);
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

  for (const key in keyMap) {
    await updateIndex(key, keyMap[key]);
  }
};

const updateIndex: <T extends TestRailRecord>(
  key: string,
  records: T[]
) => Promise<void> = async (key, records) => {
  const allIds =
    (await aha.account.getExtensionField<number[]>(IDENTIFIER, key)) ?? [];

  allIds.push(...records.map(record => record.id));

  await aha.account.setExtensionField(
    IDENTIFIER,
    key,
    Array.from(new Set(allIds))
  );
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

    await aha.account.setExtensionField(IDENTIFIER, key, best);
  }
};
