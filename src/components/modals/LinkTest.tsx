import React, {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { IDENTIFIER, Project, TestRun } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import SelectProject from './SelectProject';
import SelectTestRun from './SelectTestRun';
import SelectTest from './SelectTest';
import { getRecords } from '../../lib/extensionFields/queries';
import { linkRecords } from '../../lib/extensionFields/updates';

type Props = {
  record: ExtensionRecord;
  caseIds: number[];
  testIds: number[];
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTest: React.FC<Props> = ({
  record,
  caseIds,
  testIds,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number>(null);

  const [run, setRun] = useState<TestRun>(null);
  const [selected, setSelected] = useState<
    { caseId: number; testId: number }[]
  >([]);
  const [runStep, setRunStep] = useState<boolean>(true);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const fetchedProjects = (
        await getRecords<Project>(projectIds, 'Project')
      ).reverse();

      if (fetchedProjects?.length > 0 && !projectId) {
        setProjectId(() => fetchedProjects[0].id);
      }

      setProjects(() => fetchedProjects);
    };

    fetchProjects();
  }, []);

  const submit = useCallback(async () => {
    if (!selected.length) return;

    setSaving(() => true);

    await linkRecords(
      record,
      selected.map(({ caseId }) => caseId),
      'caseIds'
    );

    await linkRecords(
      record,
      selected.map(({ testId }) => testId),
      'testIds'
    );

    setSaving(() => false);
    onClose();
  }, [record, onClose, selected]);

  const setProject = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = Number.parseInt(e.target.value);
      setProjectId(() => id);
      setRun(() => null);
      setSelected(() => []);
    },
    []
  );

  const updateSelectedRun = useCallback(
    async (_value: string, isSelected: boolean, meta: TestRun) => {
      if (!isSelected) {
        setRun(() => null);
      } else {
        setRun(() => meta);
      }

      setSelected(() => []);
    },
    []
  );

  const selectedRunIds = useMemo(() => {
    return run ? [run.id.toString()] : [];
  }, [run]);

  const updateSelected = useCallback(
    async (value: string, isSelected: boolean, meta: number) => {
      setSelected(prev => {
        if (isSelected) {
          return [...prev, { testId: Number.parseInt(value), caseId: meta }];
        } else {
          return prev.filter(item => item.caseId !== meta);
        }
      });
    },
    [setSelected]
  );

  const selectedTestIds = useMemo(() => {
    return selected.map(item => item.testId.toString());
  }, [selected]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test'>Link test</aha-modal-header>
      <aha-modal-body>
        {syncData && !syncData.lastSync && (
          <aha-alert class='mb-5' type='warning' dismissable>
            <div slot='heading'>We haven't fully synced with TestRail yet.</div>
            We're still gathering data from the TestRail API, so search results
            will be incomplete. Please remain on the tests tab until it has
            finished.
          </aha-alert>
        )}
        <div style={{ display: runStep ? 'block' : 'none' }}>
          <div className='search-form'>
            <SelectProject
              projects={projects}
              projectId={projectId}
              setProject={setProject}
            />
            <SelectTestRun
              syncData={syncData}
              runIds={[]}
              projects={projects}
              projectId={projectId}
              selectedRunIds={selectedRunIds}
              updateSelectedRuns={updateSelectedRun}
            />
          </div>
        </div>
        <div style={{ display: runStep ? 'none' : 'block' }}>
          <SelectTest
            syncData={syncData}
            caseIds={caseIds}
            linkedIds={testIds}
            selectedTestIds={selectedTestIds}
            run={run}
            updateSelectedTestIds={updateSelected}
          />
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <div style={{ display: runStep ? 'block' : 'none' }}>
          <aha-button
            kind='primary'
            disabled={!run ? true : null}
            onClick={() => setRunStep(false)}
          >
            Next
          </aha-button>
        </div>
        <div
          className='search-column'
          style={{ display: runStep ? 'none' : 'flex' }}
        >
          <aha-button
            kind='primary'
            disabled={saving ? true : null}
            onClick={() => {
              setRunStep(true);
            }}
          >
            Back
          </aha-button>
          <aha-button
            kind='primary'
            disabled={saving || !selectedTestIds.length ? true : null}
            onClick={submit}
          >
            {saving ? 'Linking...' : 'Link to test'}
          </aha-button>
        </div>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTest;
