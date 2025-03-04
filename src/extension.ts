export const IDENTIFIER = 'aha-develop.testrail-aha';

export type TestRailRecord =
  | Project
  | Suite
  | Status
  | TestCase
  | TestRun
  | Test;

export type Project = {
  id: string;
  kind: 'Project';
  name: string;
  suite_mode: number;
};

export type Suite = {
  id: string;
  kind: 'Suite';
  name: string;
  projectId: string;
};

export type TestCase = {
  id: string;
  kind: 'TestCase';
  projectId: string;
  suiteId: string;
  title: string;
};

export type TestRun = {
  id: string;
  kind: 'TestRun';
  projectId: string;
  suiteId: string;
  name: string;
};

export type Test = {
  id: string;
  kind: 'Test';
  caseId: string;
  runId: string;
  statusId: string;
  title: string;
};

export type TestResult = {
  id: string;
  kind: 'TestResult';
  testId: string;
  comment: string;
  createdOn: number;
};

export type Status = {
  id: string;
  kind: 'Status';
  label: string;
  color: string;
};
