import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IDENTIFIER, Project, Suite } from '../../extension';
import syncSuites from '../../lib/sync/syncSuites';
import BaseSyncRow, { RowProps, ResyncProps } from './BaseSyncRow';
import { showError } from '../../lib/util';
import {
  fieldName,
  getAccountExtensionFieldMap,
  getAccountExtensionFields,
  getRecords,
  indexKeyForKindAndParent,
} from '../../lib/extensionFields/queries';
import { deleteIgnoredSuiteRecords } from '../../lib/ignore';
import { showSuccess } from '../../lib/util';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setSyncing,
  setLastSync,
}) => {
  try {
    setSyncing(true);

    const projectIds =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      )) ?? [];

    const ignoredSuites =
      (await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'ignoredSuites'
      )) ?? [];

    const now = Date.now();

    await syncSuites({
      domain,
      projectIds,
      ignoredSuiteIds: ignoredSuites,
    });

    await setLastSync(now);
  } catch (error) {
    showError(error.message);
  } finally {
    setSyncing(false);
  }
};

const ConfirmIgnoreModal: React.FC<{
  onClose: () => void;
  onConfirm: () => Promise<void>;
}> = ({ onClose, onConfirm }) => {
  const [disabled, setDisabled] = useState(false);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Update ignored suites'>
        Update ignored suites
      </aha-modal-header>
      <aha-modal-body>
        <div>
          Are you sure you want to update the ignored suites? This will delete
          the ignored suites and all associated sections, test cases, and
          results. If you remove a suite from the ignore list, a full re-sync
          will be required to reload the data associated with that suite.
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={disabled ? true : null}
          onClick={async () => {
            setDisabled(true);
            await onConfirm();
            setDisabled(false);
            onClose();
          }}
        >
          {disabled ? 'Updating, do not leave this page...' : 'Confirm'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

const IgnoreSuiteRow: React.FC<{
  setIgnoredSuites: (id: number, isIgnored: boolean) => void;
  suite: Suite;
  ignored: boolean;
}> = ({ setIgnoredSuites, suite, ignored }) => {
  return (
    <div
      className='search-row has-pointer'
      onClick={() => setIgnoredSuites(suite.id, !ignored)}
    >
      <div className={`search-result${ignored ? ' selected' : ''}`}>
        <div className='search-column'>
          {ignored ? (
            <aha-icon className='search-selected' icon='fa-solid fa-check' />
          ) : (
            <aha-icon icon='fa-regular fa-square' />
          )}

          <div className='search-text'>
            <div>{suite.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const IgnoreSuiteProjectRow: React.FC<{
  ignoreSuite: (id: number, isIgnored: boolean) => void;
  project: Project;
  suites: { suite: Suite; ignored: boolean }[];
}> = ({ ignoreSuite, project, suites }) => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded(prev => !prev);

  return (
    <>
      <div className='ignore-section' onClick={toggleExpanded}>
        <div className='search-header'>{project.name}</div>
        <aha-icon
          className='chevron'
          icon={
            expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'
          }
        />
      </div>
      {expanded && (
        <>
          {suites.map(({ suite, ignored }) => (
            <IgnoreSuiteRow
              key={suite.id}
              setIgnoredSuites={ignoreSuite}
              suite={suite}
              ignored={ignored}
            />
          ))}
        </>
      )}
    </>
  );
};

const SuiteRow: React.FC<RowProps> = ({ domain, disabled }) => {
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [suiteMapping, setSuiteMapping] = useState<{ [key: number]: Suite[] }>(
    {}
  );

  const [projectMapping, setProjectMapping] = useState<{
    [key: number]: Project;
  }>({});

  const [ignoredSuiteIds, setIgnoredSuiteIds] = useState<number[]>([]);
  const [showIgnoreSection, setShowIgnoreSection] = useState(false);
  const [reload, setReload] = useState(0);

  const reloadSuites = () => {
    setReload(prev => prev + 1);
  };

  const ignoreSuite = (id: number, isIgnored: boolean) => {
    setIgnoredSuiteIds(prev =>
      isIgnored ? [...prev, id] : prev.filter(suiteId => suiteId !== id)
    );
  };

  const updateIgnoredSuites = async () => {
    await deleteIgnoredSuiteRecords(ignoredSuiteIds);
    await aha.account.setExtensionField(
      IDENTIFIER,
      'ignoredSuites',
      ignoredSuiteIds
    );
    await showSuccess('Ignored suites successfully updated');
    reloadSuites();
  };

  useEffect(() => {
    const fetchSuites = async () => {
      setLoading(() => true);

      const projectIds =
        (await aha.account.getExtensionField<number[]>(
          IDENTIFIER,
          'projectIds'
        )) || [];

      const ignored =
        (await aha.account.getExtensionField<number[]>(
          IDENTIFIER,
          'ignoredSuites'
        )) || [];
      setIgnoredSuiteIds(ignored);

      const keys = projectIds.map(projectId =>
        indexKeyForKindAndParent('Suite', projectId)
      );

      const suiteIds = (await getAccountExtensionFields<number[]>(keys)).flat();
      const allSuites = await getRecords<Suite>(
        suiteIds.concat(ignored),
        'Suite'
      );

      const mapping = {};
      allSuites.forEach(suite => {
        if (!mapping[suite.projectId]) {
          mapping[suite.projectId] = [];
        }
        mapping[suite.projectId].push(suite);
      });

      setSuiteMapping(mapping);

      const projects =
        (await getAccountExtensionFieldMap<Project>(
          Object.keys(mapping).map(id =>
            fieldName('Project', Number.parseInt(id))
          )
        )) || {};

      setProjectMapping(projects);
      setLoading(() => false);
    };

    fetchSuites();
  }, [reload]);

  const projectSuiteMapping = useMemo(() => {
    const mapping: { [key: number]: { suite: Suite; ignored: boolean }[] } = {};

    Object.entries(suiteMapping).forEach(([projectId, suites]) => {
      mapping[projectId] = suites.map(suite => ({
        suite,
        ignored: ignoredSuiteIds.some(id => id === suite.id),
      }));
    });

    return mapping;
  }, [ignoredSuiteIds, suiteMapping]);

  return (
    <>
      <BaseSyncRow
        recordType='Test suites'
        resync={async (props: ResyncProps) => {
          await resync(props);
          reloadSuites();
        }}
        domain={domain}
        disabled={disabled}
        syncKey='syncingSuites'
        lastSyncKey='lastSuiteSync'
      />

      <>
        <div
          className='ignore-section'
          onClick={() => setShowIgnoreSection(ignoreSection => !ignoreSection)}
        >
          <div className='search-header'>Ignored suites</div>
          <aha-icon
            className='chevron'
            icon={
              showIgnoreSection
                ? 'fa-solid fa-chevron-down'
                : 'fa-solid fa-chevron-right'
            }
          />
        </div>
        {showIgnoreSection && (
          <>
            {loading ? (
              <aha-loading-row class='search-loader' rows={5} columns={2} />
            ) : (
              Object.entries(projectSuiteMapping).map(([projectId, suites]) => {
                const intProjectId = parseInt(projectId);

                return (
                  <IgnoreSuiteProjectRow
                    key={intProjectId}
                    ignoreSuite={ignoreSuite}
                    project={projectMapping[fieldName('Project', intProjectId)]}
                    suites={suites}
                  />
                );
              })
            )}
          </>
        )}
        {showIgnoreSection && !loading && (
          <>
            <div className='ignore-button'>
              <aha-button kind='primary' onClick={() => setModalOpen(true)}>
                Update ignored suites
              </aha-button>
            </div>
            {modalOpen && (
              <ConfirmIgnoreModal
                onClose={() => setModalOpen(false)}
                onConfirm={updateIgnoredSuites}
              />
            )}
          </>
        )}
      </>
    </>
  );
};

export default SuiteRow;
