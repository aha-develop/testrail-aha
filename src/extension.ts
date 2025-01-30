export const IDENTIFIER = 'aha-develop.testrail-aha';

export const CASE_PREFIX = 'case_';
export const RUN_PREFIX = 'run_';
export const TEST_PREFIX = 'test_';
export const STATUS_PREFIX = 'status_';

export type FeatureExtensionFields = {
  caseIds?: string[];
  lastSynced?: number;
} & Record<string, any>;

export type TestRailRecord = TestCase | TestRun | Test;

export type TestCase = {
  id: string;
  kind: 'TestCase';
  title: string;
  latestTestId?: string;
};

export type TestRun = {
  id: string;
  kind: 'TestRun';
  name: string;
  testIds?: string[];
};

export type Test = {
  id: string;
  kind: 'Test';
  name: string;
  caseId: string;
  runId: string;
  statusId: string;
  latestComment?: string;
};

export type Status = {
  id: string;
  kind: 'Status';
  label: string;
  color: string;
};
