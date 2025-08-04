import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { IDENTIFIER, Project, Test, TestCase } from '../../extension';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import { ExtensionRecord } from '../../lib/extensionRecord';
import {
  getRecords,
  indexKeyForKindAndParent,
} from '../../lib/extensionFields/queries';
import { linkRecord } from '../../lib/extensionFields/updates';
import SelectTestRun from './SelectTestRun';

type Props = {
  record: ExtensionRecord;
  testCase: TestCase;
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTestToTestCase: React.FC<Props> = ({
  record,
  testCase,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const [runId, setRunId] = useState<string>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const fetchedProjects = await getRecords<Project>(projectIds, 'Project');
      setProjects(() => fetchedProjects);
    };

    fetchProjects();
  }, []);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, []);

  const selectedRunIds = useMemo(() => {
    return runId ? [runId] : [];
  }, [runId]);

  const updateSelectedRun = useCallback(
    async (value: string, isSelected: boolean) => {
      if (!isSelected) {
        setRunId(() => null);
      } else {
        setRunId(() => value);
      }
    },
    []
  );

  const submit = useCallback(async () => {
    if (!runId) return;

    setSaving(() => true);

    const testIds = await aha.account.getExtensionField<number[]>(
      IDENTIFIER,
      indexKeyForKindAndParent('Test', Number.parseInt(runId))
    );

    if (!testIds || !testIds.length) {
      setSaving(() => false);
      setError(() => 'No test results found for the selected run');
      return;
    }

    const tests = await getRecords<Test>(testIds, 'Test');
    const testId = tests.find(test => test.caseId === testCase.id)?.id;

    if (!testId) {
      setSaving(() => false);
      setError(() => 'Selected run has no results for linked test case');
      return;
    }

    await linkRecord(record, testId, 'testIds');

    setSaving(() => false);
    setError(() => null);
    onClose();
  }, [record, runId, testCase]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test case to test'>
        Link test case to test
      </aha-modal-header>
      <aha-modal-body>
        {syncData && !syncData.lastSync && (
          <aha-alert class='mb-5' type='warning' dismissable>
            <div slot='heading'>We haven't fully synced with TestRail yet.</div>
            We're still gathering data from the TestRail API, so search results
            will be incomplete. Please remain on the tests tab until it has
            finished.
          </aha-alert>
        )}
        {error && (
          <aha-alert class='mb-5' type='danger'>
            <div slot='heading'>Error linking test case to test</div>
            {error}
          </aha-alert>
        )}
        <div className='search-form'>
          <SelectTestRun
            syncData={syncData}
            runIds={[]}
            projects={projects}
            projectId={testCase.projectId}
            selectedRunIds={selectedRunIds}
            updateSelectedRuns={updateSelectedRun}
          />
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={saving || !runId ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link to test'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestToTestCase;
