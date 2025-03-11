export const IDENTIFIER = 'aha-develop.testrail';

export type TestRailRecord =
  | Project
  | Suite
  | Section
  | Status
  | TestCase
  | TestRun
  | Test;

export type Project = {
  id: number;
  kind: 'Project';
  name: string;
};

export type Suite = {
  id: number;
  kind: 'Suite';
  name: string;
  projectId: number;
};

export type Section = {
  id: number;
  kind: 'Section';
  projectId: number;
  parentId?: number;
  suiteId: number;
  name: string;
};

export type TestCase = {
  id: number;
  kind: 'TestCase';
  projectId: number;
  suiteId: number;
  title: string;
  createdOn: number;
};

export type TestRun = {
  id: number;
  kind: 'TestRun';
  projectId: number;
  suiteId: number;
  name: string;
  createdOn: number;
  completed: boolean;
};

export type Test = {
  id: number;
  kind: 'Test';
  caseId: number;
  runId: number;
  statusId: number;
};

export type TestResult = {
  id: number;
  kind: 'TestResult';
  testId: number;
  comment: string;
  createdOn: number;
};

export type Status = {
  id: number;
  kind: 'Status';
  label: string;
  colorBright: number;
  colorMedium: number;
  colorDark: number;
};
