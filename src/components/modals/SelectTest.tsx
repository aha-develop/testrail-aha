import React, { useEffect, useState } from 'react';
import { TestCase, Test } from '../../extension';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';
import SearchByName, { TreeNode } from './SearchByName';
import { getRunMapForTestCase } from '../../lib/extensionFields/queries';
import SyncProgress from '../SyncProgress';
import { getRecords } from '../../lib/extensionFields/queries';

type Props = {
  caseId: string;
  syncData: BulkSyncState;
  testId: string;
  updateTestId: (value: string) => Promise<void>;
};

// The tree displays runs, because there's no identifying data to separate
// tests for the same case, and a run will have at most one test per test case.
const runOptions: (
  testCase: TestCase,
  runMapping: [Test, string, number][]
) => TreeNode[] = (testCase, runMapping) => {
  const children = runMapping.map(([test, runName, createdOn]) => ({
    value: test.id.toString(),
    text: runName,
    date: createdOn * 1000,
  }));

  if (children.length === 0) return [];

  return [
    {
      value: testCase.id.toString(),
      text: testCase.title,
      children,
    },
  ];
};

const SelectTest: React.FC<Props> = ({
  caseId,
  syncData,
  testId,
  updateTestId,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [syncingTests, setSyncingTests] = useState(false);

  const [runTree, setRunTree] = useState<TreeNode[]>([]);

  const [savedCaseId, setSavedCaseId] = useState<string>(caseId);

  useEffect(() => {
    const fetchRuns = async () => {
      const [testCase] = await getRecords<TestCase>(
        [Number.parseInt(caseId)],
        'TestCase'
      );

      const runMapping = await getRunMapForTestCase(testCase);

      setRunTree(runOptions(testCase, runMapping));
      setLoading(false);
    };

    const caseIdChanged = caseId !== savedCaseId;

    if (caseIdChanged) {
      setSavedCaseId(caseId);
    }

    if (syncData && syncing === null) {
      setSyncing(syncData.state !== SyncState.Complete);
    }

    const lastState = syncingTests;
    let currentState = syncingTests;

    if (syncData) {
      currentState = syncData.stage <= SyncStage.Tests;
      setSyncingTests(currentState);
    }

    // Load on first render, if caseId changes, or if new tests potentially synced
    const shouldLoad =
      caseId && (loading || caseIdChanged || (lastState && !currentState));

    if (caseId && caseIdChanged) {
      setLoading(true);
    }

    if (shouldLoad) fetchRuns();
  }, [caseId, syncData]);

  return (
    <div className='search-form'>
      <SearchByName
        tree={runTree}
        selected={[testId]}
        onSelect={updateTestId}
        recordName='test'
        referencePrefix='T'
        loading={loading}
        label='Select a test'
        placeholder={'No tests found for this test case.'}
      >
        {syncing && <SyncProgress syncData={syncData} />}
      </SearchByName>
    </div>
  );
};

export default SelectTest;
