import React, { useEffect, useState, useRef } from 'react';
import { IDENTIFIER, Project, Section, Suite, TestCase } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import SearchByName, { TreeNode } from './SearchByName';
import {
  getRecords,
  getProjectRecords,
} from '../../lib/extensionFields/queries';
import { waitForLambda } from '../../lib/sync/interface';
import { APIResult } from '../../lib/api';
import { saveRecords, linkRecord } from '../../lib/extensionFields/updates';
import { BulkSyncState, SyncStage, SyncState } from '../../lib/sync/bulkSync';
import SyncProgress from '../SyncProgress';

type Props = {
  domain: string;
  record: ExtensionRecord;
  syncData: BulkSyncState;
  onClose: () => void;
};

type CreateProps = {
  domain: string;
  record: ExtensionRecord;
  title: string;
  sectionId: string;
  projectId: string;
  setSaving: (saving: boolean) => void;
  setError: (error: boolean) => void;
};

const sectionOptions: (
  projects: Project[],
  suiteMapping: { [projectId: string]: Suite[] },
  sectionMapping: {
    [projectId: string]: Section[];
  }
) => TreeNode[] = (projects, suiteMapping, sectionMapping) => {
  const options: TreeNode[] = [];
  const sectionTree: { [sectionId: string]: Section[] } = {};

  const suiteSectionMapping: { [suiteId: string]: Section[] } = {};

  const mapChildren: (section: Section) => TreeNode[] | null = section => {
    const children = sectionTree[section.id];

    if (!children) return null;

    return children.map(child => ({
      text: `${child.name}`,
      value: `${child.id}`,
      children: mapChildren(child),
    }));
  };

  for (const section of Object.values(sectionMapping).flat()) {
    if (!suiteSectionMapping[section.suiteId]) {
      suiteSectionMapping[section.suiteId] = [];
    }

    suiteSectionMapping[section.suiteId].push(section);

    if (section.parentId === null) {
      continue;
    }

    if (!sectionTree[section.parentId]) {
      sectionTree[section.parentId] = [];
    }

    sectionTree[section.parentId].push(section);
  }

  for (const project of projects) {
    const children = [];
    const projectSuites = suiteMapping[project.id] || [];

    if (projectSuites.length === 0) continue;

    for (const suite of projectSuites) {
      const sections = suiteSectionMapping[suite.id] || [];

      if (sections.length === 0) continue;

      const suiteChildren = [];

      for (const section of sections) {
        if (sectionTree[section.parentId]) continue;

        suiteChildren.push({
          text: `${section.name}`,
          value: `${section.id}`,
          children: mapChildren(section),
        });
      }

      if (suiteChildren.length === 0) continue;

      // Handle default suite - shouldn't render
      if (suite.name === 'Master') {
        children.push(...suiteChildren);
      } else {
        const suiteHeader: TreeNode = {
          value: suite.id.toString(),
          text: suite.name,
          header: true,
          children: suiteChildren,
        };

        children.push(suiteHeader);
      }
    }

    if (children.length === 0) continue;

    const projectHeader: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      header: true,
      children,
    };

    options.push(projectHeader);
  }

  return options;
};

const findChild: (node: TreeNode, value: string) => boolean = (node, value) => {
  if (node.value === value) {
    return true;
  }

  if (!node.children) return false;

  for (const child of node.children) {
    if (findChild(child, value)) {
      return true;
    }
  }

  return false;
};

const createTestCase: (props: CreateProps) => Promise<boolean> = async ({
  record,
  domain,
  title,
  sectionId,
  projectId,
  setSaving,
  setError,
}) => {
  const sectionIdNum = Number.parseInt(sectionId);
  const projectIdNum = Number.parseInt(projectId);

  setSaving(true);
  setError(false);

  const eventKey = `createTestCase-${Date.now()}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.createTestCase`, args);
  };

  const args = {
    domain,
    title,
    sectionId: sectionIdNum,
    projectId: projectIdNum,
  };

  const result = await waitForLambda<APIResult>({ lambdaFunc, args, eventKey });

  if (!result || result.error) {
    setSaving(false);
    setError(true);

    return false;
  }

  const testCase = result.result as TestCase;

  await saveRecords([testCase]);

  await linkRecord(record, testCase.id, 'caseIds');

  setSaving(false);

  return true;
};

const CreateTestCase: React.FC<Props> = ({
  domain,
  record,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const titleRef = useRef(null);

  const [title, setTitle] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const [syncing, setSyncing] = useState(null);
  const [syncingSections, setSyncingSections] = useState(false);

  const [sectionId, setSectionId] = useState<string>(null);
  const sectionIdRef = useRef(sectionId);
  const projectIdRef = useRef(null);
  const [sectionTree, setSectionTree] = useState<TreeNode[]>([]);

  const updateSectionId = async value => {
    sectionIdRef.current = value; // Use this as a cache, the state is not updated immediately

    const parent = sectionTree.find(node => findChild(node, value));
    projectIdRef.current = parent.value;

    setSectionId(value);
  };

  const submit = async () => {
    const result = await createTestCase({
      domain,
      record,
      title: titleRef.current.value,
      sectionId: sectionIdRef.current,
      projectId: projectIdRef.current,
      setSaving,
      setError,
    });

    if (result) onClose();
  };

  useEffect(() => {
    const fetchSections = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [sectionMapping, suiteMapping, projects] = await Promise.all([
        getProjectRecords<Section>(projectIds, 'Section'),
        getProjectRecords<Suite>(projectIds, 'Suite'),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      setSectionTree(sectionOptions(projects, suiteMapping, sectionMapping));
      setLoading(false);
    };

    if (syncData && syncing === null) {
      setSyncing(syncData.state !== SyncState.Complete);
    }

    const lastState = syncingSections;
    let currentState = syncingSections;

    if (syncData) {
      currentState = syncData.stage <= SyncStage.Sections;
      setSyncingSections(currentState);
    }

    if (loading || (lastState && !currentState)) fetchSections();
  }, [syncData]);

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Create test case'>
        Create test case
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
          <aha-alert class='mb-5' type='danger' dismissable>
            <div slot='heading'>Could not create test case</div>
            Please refresh the page and try again. If this problem continues,
            please contact <a href='mailto:support@aha.io'>support@aha.io</a>.
          </aha-alert>
        )}
        <aha-field class='left-align-input' required>
          <div slot='label'>Name</div>
          <input
            ref={titleRef}
            type='text'
            placeholder='Enter test case name'
            onInput={event => setTitle(event.target.value)}
          />
        </aha-field>
        <div className='search-form'>
          <SearchByName
            tree={sectionTree}
            selected={[sectionId]}
            onSelect={updateSectionId}
            recordName='section'
            showReference={false}
            loading={loading}
            label='Select a section'
            placeholder='No synced sections found.'
          >
            {syncing && <SyncProgress syncData={syncData} />}
          </SearchByName>
        </div>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={
            loading || saving || !sectionId || !title.trim().length
              ? true
              : null
          }
          onClick={submit}
        >
          {saving ? 'Creating...' : 'Create and link'}
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default CreateTestCase;
