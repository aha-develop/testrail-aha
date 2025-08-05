import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IDENTIFIER, Test, TestCase, TestRun } from '../../extension';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';
import ApiSearch, { TreeNode } from './ApiSearch';
import { indexKeyForKindAndParent } from '../../lib/extensionFields/queries';
import SyncProgress from '../SyncProgress';
import { getRecords } from '../../lib/extensionFields/queries';

type Props = {
  run: TestRun;
  caseIds: number[];
  linkedIds: number[];
  syncData: BulkSyncState;
  selectedTestIds: string[];
  updateSelectedTestIds: (
    testId: string,
    isSelected: boolean,
    meta?: any
  ) => Promise<void>;
};

// Given a test run, allows you to select multiple tests for that run
const SelectTest: React.FC<Props> = ({
  run,
  caseIds,
  linkedIds,
  syncData,
  selectedTestIds,
  updateSelectedTestIds,
}) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [syncingTests, setSyncingTests] = useState(false);

  const [lastRunId, setLastRunId] = useState<number>(run?.id);
  const [tests, setTests] = useState<Test[]>([]);

  const [searchIds, setSearchIds] = useState<number[]>([]);

  useEffect(() => {
    const fetchTests = async () => {
      if (!run) return;

      const testIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        indexKeyForKindAndParent('Test', run.id)
      );

      const fetchedTests = await getRecords<Test>(testIds, 'Test');
      setTests(() => fetchedTests);

      // Tests don't have a name/title, so we use test cases for search
      setSearchIds(() => fetchedTests.map(test => test.caseId));
      setLoading(() => false);
    };

    if (syncData && syncing === null) {
      setSyncing(() => syncData.state !== SyncState.Complete);
    }

    const lastState = syncingTests;
    let currentState = syncingTests;

    if (syncData) {
      currentState = syncData.stage <= SyncStage.Tests;
      setSyncingTests(() => currentState);
    }

    const runIdChanged = lastRunId !== run?.id;
    if (runIdChanged) setLastRunId(() => run?.id);

    // Load on first render if caseId changes, or if new tests potentially synced
    const shouldLoad =
      run && (loading || runIdChanged || (lastState && !currentState));

    if (run && runIdChanged) {
      setLoading(() => true);
    }

    if (shouldLoad) fetchTests();
  }, [run, syncData]);

  const caseIdsSet = useMemo(() => new Set(caseIds), [caseIds]);
  const linkedIdsSet = useMemo(() => new Set(linkedIds), [linkedIds]);

  const buildTree: (
    fields: Aha.ExtensionField[],
    referenceMatches: number[]
  ) => Promise<TreeNode[]> = useCallback(
    async (fields, referenceMatches) => {
      const matchedCases = fields.map(field => field.value as TestCase);

      const caseMap: { [caseId: number]: TestCase } = matchedCases.reduce(
        (map, testCase) => {
          map[testCase.id] = testCase;
          return map;
        },
        {}
      );

      let children = tests.filter(test => caseMap[test.caseId]);

      const referenceMatchedTests = new Set(
        referenceMatches.filter(id => !children.some(child => child.id === id))
      );

      if (referenceMatchedTests.size > 0) {
        const records = tests.filter(test =>
          referenceMatchedTests.has(test.id)
        );

        const casesToFetch = [];
        records.forEach(test => {
          if (!caseMap[test.caseId]) {
            casesToFetch.push(test.caseId);
          }
        });

        const cases = await getRecords<TestCase>(casesToFetch, 'TestCase');

        children = children.concat(records);
        cases.forEach(testCase => {
          caseMap[testCase.id] = testCase;
        });
      }

      // If a match is for a linked test, show it as linked, but if
      // a match is for a linked case and an unknown test, hide it so the user can't
      // overwrite their linked tests.
      children = children.filter(
        test => linkedIdsSet.has(test.id) || !caseIdsSet.has(test.caseId)
      );

      children.sort((a, b) => b.id - a.id);

      const nodes = children.map(record => ({
        value: record.id.toString(),
        text: caseMap[record.caseId]?.title,
        meta: record.caseId,
      }));

      if (!run || nodes.length === 0) {
        return [];
      }

      return [
        {
          value: run.id.toString(),
          text: run.name,
          children: nodes,
        },
      ];
    },
    [run, tests]
  );

  return (
    <div className='search-form'>
      <ApiSearch
        searchIds={searchIds}
        selected={selectedTestIds}
        linkedIds={linkedIds}
        searchKind={'TestCase'}
        searchKey={'title'}
        onSelect={updateSelectedTestIds}
        buildTree={buildTree}
        recordName='test'
        referencePrefix='T'
        loading={loading}
        label='Select a test'
        placeholder='No synced tests found.'
      >
        {syncing && <SyncProgress syncData={syncData} />}
      </ApiSearch>
    </div>
  );
};

export default SelectTest;
