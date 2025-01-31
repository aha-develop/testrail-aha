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

// Memoize the call to getExtensionFields on account to prevent unnecessary reloads,
// so we avoid having to pass around the account fields when loading extension data.
const memoizedAccountFields: () => () => Promise<Record<string, any>> = () => {
  let extensionFields = null;

  return async () => {
    if (extensionFields) return extensionFields;

    const fieldArray = await aha.account.getExtensionFields(IDENTIFIER);

    return (extensionFields = fieldArray.reduce((fields, field) => {
      fields[field.name] = field.value;
      return fields;
    }, {}));
  };
};

export const getExtensionFields = memoizedAccountFields();

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
