import {
  IDENTIFIER,
  Project,
  Suite,
  TestCase,
  TestRun,
  Test,
  Status,
  TestRailRecord,
  TestResult,
} from '../../extension';

// Guard against overloading the GQL by fetching thousands of records at once.
const GQL_BATCH_SIZE = 500;

export const fieldName: (kind: TestRailRecord['kind'], id: string) => string = (
  kind,
  id
) => {
  switch (kind) {
    case 'Status':
      return `status_${id}`;
    case 'Project':
      return `project_${id}`;
    case 'Suite':
      return `suite_${id}`;
    case 'TestCase':
      return `case_${id}`;
    case 'TestRun':
      return `run_${id}`;
    case 'Test':
      return `test_${id}`;
  }
};

// To minimize the size of the index extension fields, we use multiple indexes
// scoped by parent record.
export const indexKeyForRecord: (
  record: TestRailRecord | TestResult
) => string = record => {
  switch (record.kind) {
    case 'Status':
    case 'Project':
      return indexKeyForKindAndParent(record.kind);
    case 'Suite':
    case 'TestCase':
    case 'TestRun':
      return indexKeyForKindAndParent(record.kind, record.projectId);
    case 'Test':
      return indexKeyForKindAndParent(record.kind, record.runId);
    case 'TestResult':
      return indexKeyForKindAndParent(record.kind, record.testId);
  }
};

export const indexKeyForKindAndParent: (
  kind: TestRailRecord['kind'] | 'TestResult',
  parentId?: string
) => string = (kind, parentId) => {
  switch (kind) {
    case 'Status':
      return `statusIds`;
    case 'Project':
      return `projectIds`;
    case 'Suite':
      return `project_${parentId}_suiteIds`;
    case 'TestCase':
      return `project_${parentId}_caseIds`;
    case 'TestRun':
      return `project_${parentId}_runIds`;
    case 'Test':
      return `run_${parentId}_testIds`;
    case 'TestResult':
      return `test_${parentId}_comment`;
  }
};

const queryExtensionFields: (
  names: string[]
) => Promise<Aha.ExtensionField[]> = async (names: string[]) => {
  const results: Aha.ExtensionField[] = [];

  for (let i = 0; i < names.length; i += GQL_BATCH_SIZE) {
    const chunk = names.slice(i, i + GQL_BATCH_SIZE);

    const result = await aha.models.Account.select('id')
      .merge({
        extensionFields: aha.models.ExtensionField.select(
          'name',
          'value'
        ).where({
          name: chunk,
        }),
      })
      .find(aha.account.id);

    results.push(...result.extensionFields);
  }

  return results;
};

export const getAccountExtensionFieldMap: <T>(
  names: string[]
) => Promise<{ [key: string]: T }> = async names => {
  const extensionFields = await queryExtensionFields(names);

  return extensionFields.reduce((acc, field) => {
    if (!field.value) return acc;
    return { ...acc, [field.name]: field.value };
  }, {});
};

const getAccountExtensionFields: <T>(
  names: string[]
) => Promise<T[]> = async names => {
  const extensionFields = await queryExtensionFields(names);

  return extensionFields.map(field => field.value).filter(value => value);
};

export async function getStatuses(
  statusIds?: (string | undefined)[]
): Promise<Status[]> {
  const filteredIds = statusIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('Status', id));

  return await getAccountExtensionFields<Status>(names);
}

export async function getProjects(
  projectIds?: (string | undefined)[]
): Promise<Project[]> {
  const filteredIds = projectIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('Project', id));

  return await getAccountExtensionFields<Project>(names);
}

export async function getSuites(
  suiteIds?: (string | undefined)[]
): Promise<Suite[]> {
  const filteredIds = suiteIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('Suite', id));

  return await getAccountExtensionFields<Suite>(names);
}

export async function getTestCases(
  caseIds?: (string | undefined)[]
): Promise<TestCase[]> {
  const filteredIds = caseIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('TestCase', id));

  return await getAccountExtensionFields<TestCase>(names);
}

export async function getProjectTestCases(
  projectIds: string[] | undefined
): Promise<{
  [projectId: string]: TestCase[];
}> {
  if (!projectIds || projectIds.length === 0) return {};

  const mapping: { [projectId: string]: TestCase[] } = {};

  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent('TestCase', projectId)
  );

  const caseIds = (await getAccountExtensionFields<string[]>(keys)).flat();

  const cases = await getTestCases(caseIds);

  for (const testCase of cases) {
    if (!mapping[testCase.projectId]) {
      mapping[testCase.projectId] = [];
    }

    mapping[testCase.projectId].push(testCase);
  }

  return mapping;
}

export async function getLinkedComments(
  tests: Test[]
): Promise<{ [testId: string]: string }> {
  const commentKey = test => `${fieldName('Test', test.id)}_comment`;

  const keys = tests.map(test => commentKey(test));

  const commentLinks = await getAccountExtensionFieldMap<{
    timestamp: number;
    comment: string;
  }>(keys);

  return tests.reduce(
    (result, test, i) => ({
      ...result,
      [test.id]: commentLinks[commentKey(test)]?.comment,
    }),
    {}
  );
}

export async function getTestRuns(
  runIds?: (string | undefined)[]
): Promise<TestRun[]> {
  const filteredIds = runIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('TestRun', id));

  return await getAccountExtensionFields<TestRun>(names);
}

export async function getAllRunIds(): Promise<string[]> {
  const projectIds = await aha.account.getExtensionField<string[]>(
    IDENTIFIER,
    'projectIds'
  );

  if (!projectIds || projectIds.length === 0) return [];

  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent('TestRun', projectId)
  );

  const runIds = (await getAccountExtensionFields<string[]>(keys)).flat();
  const runs = await getTestRuns(runIds);

  return runs.map(run => run.id);
}

export async function getTests(
  testIds?: (string | undefined)[]
): Promise<Test[]> {
  const filteredIds = testIds?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName('Test', id));

  return await getAccountExtensionFields<Test>(names);
}
