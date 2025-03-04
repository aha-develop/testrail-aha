import React, { useEffect, useState, useRef } from 'react';
import { TestCase, Test } from '../extension';
import { BulkSyncState } from '../lib/sync/bulkSync';
import { ExtensionRecord } from '../lib/extensionRecord';
import SearchByName, { TreeNode } from './SearchByName';
import { getRunMapForTestCase } from '../lib/extensionFields/queries';
import { linkRecord } from '../lib/extensionFields/updates';
import SyncProgress from './SyncProgress';

type Props = {
  record: ExtensionRecord;
  testCase: TestCase;
  syncData: BulkSyncState;
  onClose: () => void;
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

const LinkTestToTestCase: React.FC<Props> = ({
  record,
  testCase,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [testId, setTestId] = useState<string>(null);
  const testIdRef = useRef(testId);

  const [runTree, setRunTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    const fetchRuns = async () => {
      const runMapping = await getRunMapForTestCase(testCase);

      setRunTree(runOptions(testCase, runMapping));
      setLoading(false);
    };

    fetchRuns();
  }, []);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, []);

  const updateTestId = async value => {
    testIdRef.current = value;
    setTestId(value);
  };

  const submit = async () => {
    if (!testIdRef.current) return;

    setSaving(true);

    await linkRecord(record, Number.parseInt(testIdRef.current), 'testIds');

    setSaving(false);
    onClose();
  };

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test case to test'>
        Link test case to test
      </aha-modal-header>
      <aha-modal-body>
        {!syncData?.lastSync && (
          <aha-alert class='mb-5' type='warning' dismissable>
            <div slot='heading'>We haven't fully synced with TestRail yet.</div>
            We're still gathering data from the TestRail API, so search results
            will be incomplete. Please remain on the tests tab until it has
            finished.
          </aha-alert>
        )}
        <SearchByName
          tree={runTree}
          selected={[testId]}
          onSelect={updateTestId}
          recordName='test'
          referencePrefix='T'
          loading={loading}
        >
          <SyncProgress syncData={syncData} />
          <div style={{ flexGrow: 0 }}>
            <aha-button
              kind='primary'
              disabled={loading || saving || !testId ? true : null}
              onClick={submit}
            >
              {saving ? 'Linking...' : 'Link to test'}
            </aha-button>
          </div>
        </SearchByName>
      </aha-modal-body>
    </aha-modal>
  );
};

export default LinkTestToTestCase;
