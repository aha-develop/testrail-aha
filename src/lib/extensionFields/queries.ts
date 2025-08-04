import {
  IDENTIFIER,
  Section,
  Suite,
  TestCase,
  TestRun,
  Test,
  TestRailRecord,
  TestResult,
} from '../../extension';

import queryExtensionFields from './queryExtensionFields';

export const fieldName: (kind: TestRailRecord['kind'], id: number) => string = (
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
    case 'Section':
      return `section_${id}`;
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
    case 'Section':
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
  parentId?: number
) => string = (kind, parentId) => {
  switch (kind) {
    case 'Status':
      return `statusIds`;
    case 'Project':
      return `projectIds`;
    case 'Suite':
      return `project_${parentId}_suiteIds`;
    case 'Section':
      return `project_${parentId}_sectionIds`;
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

export const getAccountExtensionFieldMap: <T>(
  names: string[]
) => Promise<{ [key: string]: T }> = async names => {
  const extensionFields = await queryExtensionFields(names);

  return extensionFields.reduce((acc, field) => {
    if (!field.value) return acc;
    return { ...acc, [field.name]: field.value };
  }, {});
};

export const getAccountExtensionFields: <T>(
  names: string[]
) => Promise<T[]> = async names => {
  const extensionFields = await queryExtensionFields(names);

  return extensionFields.map(field => field.value).filter(value => value);
};

export const getRecords: <T extends TestRailRecord>(
  ids: (number | undefined)[],
  kind: TestRailRecord['kind']
) => Promise<T[]> = async <T extends TestRailRecord>(ids, kind) => {
  const filteredIds = ids?.filter(id => id);

  if (!filteredIds || filteredIds.length === 0) return [];

  const names = filteredIds.map(id => fieldName(kind, id));

  const result = await getAccountExtensionFields<T>(names);

  return result.sort((a, b) => b.id - a.id); // Sort by ID descending
};

export const getProjectRecords: <
  T extends TestRun | TestCase | Suite | Section
>(
  projectIds: number[] | undefined,
  kind: TestRailRecord['kind']
) => Promise<{
  [projectId: number]: T[];
}> = async <T extends TestRun | TestCase | Suite | Section>(
  projectIds,
  kind
) => {
  if (!projectIds || projectIds.length === 0) return {};

  const mapping: { [projectId: number]: T[] } = {};

  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent(kind, projectId)
  );

  const ids = (await getAccountExtensionFields<number[]>(keys)).flat();

  const records = await getRecords<T>(ids, kind);

  let ignoredSuites = [];

  if (kind === 'Suite') {
    ignoredSuites =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'ignoredSuites'
      )) || [];
  }

  for (const record of records) {
    if (kind === 'Suite' && ignoredSuites.includes(record.id)) {
      continue;
    }

    if (!mapping[record.projectId]) {
      mapping[record.projectId] = [];
    }

    mapping[record.projectId].push(record);
  }

  return mapping;
};

export const getProjectSuiteMapping: (
  projectIds: number[] | undefined,
  ignoredSuites: number[]
) => Promise<{ [projectId: number]: number[] }> = async (
  projectIds,
  ignoredSuites
) => {
  if (!projectIds || projectIds.length === 0) return {};

  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent('Suite', projectId)
  );

  const projectSuites = {};
  const suiteFields = await getAccountExtensionFieldMap<number[]>(keys);

  for (const key in suiteFields) {
    const projectId = key.split('_')[1];

    const visibleSuites = suiteFields[key].filter(
      suiteId => !ignoredSuites.includes(suiteId)
    );

    if (visibleSuites.length === 0) continue;

    if (!projectSuites[projectId]) {
      projectSuites[projectId] = [];
    }

    projectSuites[projectId].push(...visibleSuites);
  }

  return projectSuites;
};

export const getLinkedComments: (ids: number[]) => Promise<{
  [testId: number]: { comment: string; timestamp: number };
}> = async ids => {
  const commentKey = id => `${fieldName('Test', id)}_comment`;

  const keys = ids.map(id => commentKey(id));

  const commentLinks = await getAccountExtensionFieldMap<{
    timestamp: number;
    comment: string;
  }>(keys);

  return ids.reduce(
    (result, id) => ({
      ...result,
      [id]: commentLinks[commentKey(id)],
    }),
    {}
  );
};

// Used when individual syncing tests and results - note that this is potentially less
// performant than even bulk sync, depending on the number of saved completed runs.
export const getAllRunIds: () => Promise<number[]> = async () => {
  const projectIds = await aha.account.getExtensionField<number[]>(
    IDENTIFIER,
    'projectIds'
  );

  if (!projectIds || projectIds.length === 0) return [];

  const keys = projectIds.map(projectId =>
    indexKeyForKindAndParent('TestRun', projectId)
  );

  const runIds = (await getAccountExtensionFields<number[]>(keys)).flat();

  return runIds;
};

export const getRunRowData: (
  runIds: undefined | number[]
) => Promise<
  [{ [runId: number]: [TestCase, Test][] }, Test[]]
> = async runIds => {
  if (!runIds) return [{}, []];

  const testKeys = runIds.map(runId => indexKeyForKindAndParent('Test', runId));
  const testIds = (await getAccountExtensionFields<number[]>(testKeys)).flat();
  const tests = await getRecords<Test>(testIds, 'Test');

  const caseKeys = tests.map(test => fieldName('TestCase', test.caseId));
  const testCases = await getAccountExtensionFields<TestCase>(caseKeys);

  const testCaseMap = testCases.reduce((acc, testCase) => {
    acc[testCase.id] = testCase;
    return acc;
  }, {});

  const testMap = tests.reduce(
    (acc: { [runId: number]: [TestCase, Test][] }, test) => {
      if (!acc[test.runId]) {
        acc[test.runId] = [];
      }

      const testCase = testCaseMap[test.caseId];

      if (!testCase) return acc;

      acc[test.runId].push([testCase, test]);

      return acc;
    },
    {}
  );

  return [testMap, tests];
};
