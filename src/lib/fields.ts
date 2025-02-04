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

// Memoize the call to getExtensionFields on account to prevent unnecessary reloads,
// so we avoid having to pass around the account fields when loading extension data.
const memoizedAccountFields: () => [
  () => Promise<Record<string, any>>,
  () => void
] = () => {
  let extensionFields = null;

  const memoized = async () => {
    if (extensionFields) return extensionFields;

    const fieldArray = await aha.account.getExtensionFields(IDENTIFIER);

    return (extensionFields = fieldArray.reduce((fields, field) => {
      fields[field.name] = field.value;
      return fields;
    }, {}));
  };

  const clearCache = () => (extensionFields = null);

  return [memoized, clearCache];
};

const memoized = memoizedAccountFields();

export const getExtensionFields = memoized[0];
export const clearExtensionFields = memoized[1];

export async function getTestCase(
  caseId?: string
): Promise<TestCase | undefined> {
  if (!caseId) return undefined;

  const accountFields = await getExtensionFields();

  return accountFields[`${CASE_PREFIX}${caseId}`];
}

export async function getRun(runId?: string): Promise<TestRun | undefined> {
  if (!runId) return undefined;

  const accountFields = await getExtensionFields();

  return accountFields[`${RUN_PREFIX}${runId}`];
}

export async function getTest(testId?: string): Promise<Test | undefined> {
  if (!testId) return undefined;

  const accountFields = await getExtensionFields();

  return accountFields[`${TEST_PREFIX}${testId}`];
}

export async function getStatus(
  statusId?: string
): Promise<Status | undefined> {
  if (!statusId) return undefined;

  const accountFields = await getExtensionFields();

  return accountFields[`${STATUS_PREFIX}${statusId}`];
}

export async function linkTestCase(
  id: string,
  typename: string,
  caseId: string
) {
  const record = aha.models[typename].select('id').find(id);

  if (!record) {
    throw new Error(`Could not find record ${typename}#${id}`);
  }

  let caseIds = (await record.getExtensionField(IDENTIFIER, 'caseIds')) as
    | string[]
    | undefined;

  if (!caseIds) caseIds = [];

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
