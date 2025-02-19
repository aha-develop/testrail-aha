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
  lastSynced: number;
  fields: { [name: string]: any };
};

export type TestRun = {
  id: string;
  kind: 'TestRun';
  projectId: string;
  suiteId: string;
  name: string;
  lastSynced: number;
};

export type Test = {
  id: string;
  kind: 'Test';
  name: string;
  caseId: string;
  runId: string;
  statusId: string;
  lastSynced: number;
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
