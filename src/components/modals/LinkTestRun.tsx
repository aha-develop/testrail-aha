import React, { useCallback, useEffect, useState, useRef } from 'react';
import { IDENTIFIER, Project } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { getRecords } from '../../lib/extensionFields/queries';
import { linkRecords } from '../../lib/extensionFields/updates';
import { BulkSyncState } from '../../lib/sync/bulkSync';
import SelectProject from './SelectProject';
import SelectTestRun from './SelectTestRun';

type Props = {
  record: ExtensionRecord;
  runIds: number[] | undefined;
  syncData: BulkSyncState;
  onClose: () => void;
};

const LinkTestRun: React.FC<Props> = ({
  record,
  runIds,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

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
    if (!selectedRunIds.length) return;

    setSaving(() => true);

    await linkRecords(
      record,
      selectedRunIds.map(id => Number.parseInt(id)),
      'runIds'
    );

    setSaving(() => false);
    onClose();
  }, [selectedRunIds, record, onClose]);

  const setProject = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = Number.parseInt(e.target.value);
      setProjectId(() => id);
      setSelectedRunIds(() => []);
    },
    []
  );

  const updateSelectedRuns: (
    value: string,
    isSelected: boolean
  ) => Promise<void> = useCallback(
    async (value: string, isSelected: boolean) => {
      setSelectedRunIds(prev => {
        if (runIds.includes(Number.parseInt(value))) {
          return prev;
        }

        if (isSelected) {
          return [...prev, value];
        } else {
          return prev.filter(id => id !== value);
        }
      });
    },
    [runIds]
  );

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test run'>
        Link test run
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
        <div className='search-form'>
          <SelectProject
            projects={projects}
            projectId={projectId}
            setProject={setProject}
          />
          <SelectTestRun
            syncData={syncData}
            runIds={runIds}
            projects={projects}
            projectId={projectId}
            selectedRunIds={selectedRunIds}
            updateSelectedRuns={updateSelectedRuns}
          />
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={saving || !selectedRunIds.length ? true : null}
          onClick={submit}
        >
          {saving ? 'Linking...' : 'Link test run'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestRun;
