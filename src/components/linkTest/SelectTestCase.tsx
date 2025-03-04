import React, { useEffect, useState } from 'react';
import SearchByName, { TreeNode } from '../SearchByName';
import SyncProgress from '../SyncProgress';
import { IDENTIFIER, Project, TestCase } from '../../extension';
import {
  getRecords,
  getProjectTestCases,
} from '../../lib/extensionFields/queries';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState } from '../../lib/sync/bulkSync';

type Props = {
  record: ExtensionRecord;
  syncData: BulkSyncState;
  caseId: string;
  setCaseId: (caseId: string) => Promise<void>;
};

const caseOptions: (
  projects: Project[],
  caseMapping: {
    [projectId: string]: TestCase[];
  },
  caseIds: number[]
) => TreeNode[] = (projects, caseMapping, caseIds) => {
  const options: TreeNode[] = [];

  const idMapping = caseIds.reduce((acc, id) => {
    acc[id] = true;
    return acc;
  }, {});

  for (const project of projects) {
    const cases = caseMapping[project.id] || [];

    const filteredCases = cases.filter(c => !idMapping[c.id]);

    if (filteredCases.length === 0) continue;

    const header: TreeNode = {
      value: project.id.toString(),
      text: project.name,
      children: filteredCases.map(c => ({
        text: c.title,
        value: `${c.id}`,
        date: c.createdOn * 1000,
      })),
    };

    options.push(header);
  }

  return options;
};

const LinkByNameForm: React.FC<Props> = ({
  record,
  syncData,
  caseId,
  setCaseId,
}) => {
  const [loading, setLoading] = useState(true);

  const [caseTree, setCaseTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    const fetchCases = async () => {
      const projectIds = await aha.account.getExtensionField<number[]>(
        IDENTIFIER,
        'projectIds'
      );

      const caseIds = await record.getExtensionField<number[]>(
        IDENTIFIER,
        'caseIds'
      );

      const [caseMapping, projects] = await Promise.all([
        getProjectTestCases(projectIds),
        getRecords<Project>(projectIds, 'Project'),
      ]);

      setCaseTree(caseOptions(projects, caseMapping, caseIds));
      setLoading(false);
    };

    fetchCases();
  }, []);

  return (
    <div className='search-form'>
      <SearchByName
        tree={caseTree}
        selected={[caseId]}
        onSelect={setCaseId}
        recordName='test case'
        referencePrefix='C'
        loading={loading}
      >
        <SyncProgress syncData={syncData} />
      </SearchByName>
    </div>
  );
};

export default LinkByNameForm;
