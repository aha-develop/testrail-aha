import {
  IDENTIFIER,
  CASE_PREFIX,
  RUN_PREFIX,
  TEST_PREFIX,
  STATUS_PREFIX,
  TestCase,
  TestRun,
  Test,
  Status,
} from '../extension';
import { ExtensionRecord } from './extensionRecord';

type FeatureTabData = {
  testCases: TestCase[];
  tests: { [key: string]: Test };
  statuses: { [key: string]: Status };
};

const getAccountExtensionFields: <T>(
  names: string[]
) => Promise<T[]> = async names => {
  // We fetch fields through the account as it's not possible to fetch account-level extension
  // fields directly through the ExtensionField model.

  const result = await aha.models.Account.select('id')
    .merge({
      extensionFields: aha.models.ExtensionField.select('name', 'value').where({
        name: names,
      }),
    })
    .find(aha.account.id);

  return result.extensionFields.map(field => field.value);
};

export async function getFeatureTabData(
  caseIds: string[]
): Promise<FeatureTabData> {
  const testCases = await getTestCases(caseIds);

  const testIds = testCases.map(testCase => testCase.latestTestId);
  const tests = await getTests(testIds);
  const testMap = tests.reduce((acc, test) => {
    acc[test.id] = test;
    return acc;
  }, {});

  const statusIds = tests.map(test => test.statusId);
  const statuses = await getStatuses(statusIds);
  const statusMap = statuses.reduce((acc, status) => {
    acc[status.id] = status;
    return acc;
  }, {});

  return { testCases, tests: testMap, statuses: statusMap };
}

export async function getTestCases(
  caseIds: (string | undefined)[]
): Promise<TestCase[]> {
  const filteredIds = caseIds.filter(id => id);

  if (filteredIds.length === 0) return [];

  const names = filteredIds.map(id => `${CASE_PREFIX}${id}`);

  return await getAccountExtensionFields<TestCase>(names);
}

async function getTestRuns(runIds: (string | undefined)[]): Promise<TestRun[]> {
  const filteredIds = runIds.filter(id => id);

  if (filteredIds.length === 0) return [];

  const names = filteredIds.map(id => `${RUN_PREFIX}${id}`);

  return await getAccountExtensionFields<TestRun>(names);
}

async function getTests(testIds: (string | undefined)[]): Promise<Test[]> {
  const filteredIds = testIds.filter(id => id);

  if (filteredIds.length === 0) return [];

  const names = filteredIds.map(id => `${TEST_PREFIX}${id}`);

  return await getAccountExtensionFields<Test>(names);
}

async function getStatuses(
  statusIds: (string | undefined)[]
): Promise<Status[]> {
  const filteredIds = statusIds.filter(id => id);

  if (filteredIds.length === 0) return [];

  const names = filteredIds.map(id => `${STATUS_PREFIX}${id}`);

  return await getAccountExtensionFields<Status>(names);
}

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
