import React, { useEffect, useState, useRef } from 'react';
import { TestCase, Test } from '../../extension';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import { ExtensionRecord } from '../../lib/extensionRecord';
import SearchByName, { TreeNode } from '../SearchByName';
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
  return [
    {
      value: testCase.id.toString(),
      text: testCase.title,
      children: runMapping.map(([test, runName, createdOn]) => ({
        value: test.id.toString(),
        text: runName,
        date: createdOn * 1000,
      })),
    },
  ];
};

const SelectRun: React.FC<Props> = ({
  caseId,
  syncData,
  testId,
  updateTestId,
}) => {
  const [loading, setLoading] = useState(true);

  const [runTree, setRunTree] = useState<TreeNode[]>([]);

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

    if (caseId) fetchRuns();
  }, [caseId]);

  return (
    <div className='search-form'>
      <SearchByName
        tree={runTree}
        selected={[testId]}
        onSelect={updateTestId}
        recordName='test'
        referencePrefix='T'
        loading={loading}
      >
        <SyncProgress syncData={syncData} />
      </SearchByName>
    </div>
  );
};

export default SelectRun;
