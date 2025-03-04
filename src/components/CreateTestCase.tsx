import React, { useEffect, useState, useRef } from 'react';
import { IDENTIFIER, Project, Section, TestCase } from '../extension';
import { ExtensionRecord } from '../lib/extensionRecord';
import SearchByName, { TreeNode } from './SearchByName';
import { getRecords, getProjectSections } from '../lib/extensionFields/queries';
import { waitForLambda } from '../lib/sync/interface';
import { APIResult } from '../lib/api';
import { saveRecords, linkRecord } from '../lib/extensionFields/updates';
import { BulkSyncState } from '../lib/sync/bulkSync';
import SyncProgress from './SyncProgress';

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
  sectionMapping: {
    [projectId: string]: Section[];
  }
) => TreeNode[] = (projects, sectionMapping) => {
  const options: TreeNode[] = [];

  const sectionTree: { [sectionId: string]: Section[] } = {};

  const mapChildren: (section: Section) => TreeNode[] | null = section => {
    const children = sectionTree[section.id];

    if (!children) return null;

    return children.map(child => ({
      text: child.name,
      value: `${child.id}`,
      children: mapChildren(child),
    }));
  };

  for (const section of Object.values(sectionMapping).flat()) {
    if (section.parentId === null) {
      continue;
    }

    if (!sectionTree[section.parentId]) {
      sectionTree[section.parentId] = [];
    }

    sectionTree[section.parentId].push(section);
  }

  for (const project of projects) {
    const sections = sectionMapping[project.id] || [];

    if (sections.length === 0) continue;

    const children = [];

    for (const section of sections) {
      if (sectionTree[section.parentId]) continue;

      children.push({
        text: section.name,
        value: `${section.id}`,
        children: mapChildren(section),
      });
    }

    const header: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      children,
    };

    options.push(header);
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

const createTestCase: (props: CreateProps) => Promise<void> = async ({
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

  if (result.error) {
    setSaving(false);
    setError(true);

    return;
  }

  const testCase = result.result as TestCase;

  await saveRecords([testCase]);

  await linkRecord(record, testCase.id, 'caseIds');

  setSaving(false);
};

const CreateTestCase: React.FC<Props> = ({
  domain,
  record,
  syncData,
  onClose,
}) => {
  const modalRef = useRef(null);
  const titleRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

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

  const submit = () => {
    createTestCase({
      domain,
      record,
      title: titleRef.current.value,
      sectionId: sectionIdRef.current,
      projectId: projectIdRef.current,
      setSaving,
      setError,
    });
  };

  useEffect(() => {
    const fetchSections = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const [sectionMapping, projects] = await Promise.all([
        getProjectSections(projectIds),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      setSectionTree(sectionOptions(projects, sectionMapping));
      setLoading(false);
    };

    fetchSections();
  }, []);

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
        {!syncData?.lastSync && (
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
          />
        </aha-field>
        <SearchByName
          tree={sectionTree}
          selected={[sectionId]}
          onSelect={updateSectionId}
          recordName='section'
          showReference={false}
          loading={loading}
        >
          <SyncProgress syncData={syncData} />
        </SearchByName>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button
          kind='primary'
          disabled={
            loading ||
            saving ||
            !sectionId ||
            !titleRef.current?.value.trim().length
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
