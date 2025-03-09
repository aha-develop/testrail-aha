import React, { useState } from 'react';
import { TestCase, TestRun, Test, Status } from '../../extension';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { unlinkRecord } from '../../lib/extensionFields/updates';
import RecordLink from '../RecordLink';
import TestRow from './TestRow';
import { numberToColor } from '../../lib/util';

const PASSED_STATUS_ID = 1; // True for all TestRail accounts

type Props = {
  run: TestRun;
  rows: [TestCase, Test][];
  comments: { [testId: number]: { timestamp: number; comment: string } };
  statuses: { [statusId: number]: Status };
  domain: string;
  record: ExtensionRecord;
};

type ExpanderProps = {
  expanded: boolean;
  onClick: (value: boolean) => void;
};

const getPassedPercentage: (
  rows: [TestCase, Test][],
  passed: number
) => number = (rows, passed) => {
  const total = rows.length;
  return Math.round((passed / total) * 100);
};

const Expander: React.FC<ExpanderProps> = ({ expanded, onClick }) => {
  const icon = expanded ? 'fa-chevron-up' : 'fa-chevron-down';

  return (
    <div className='has-pointer text-gray' onClick={() => onClick(!expanded)}>
      <aha-icon icon={`fa-regular ${icon}`} />
    </div>
  );
};

const StatusCount: React.FC<{ status?: Status; count: number }> = ({
  status,
  count,
}) => {
  if (!status) return null;

  return (
    <div className='status-count text-small'>
      <aha-icon
        style={{ color: numberToColor(status.colorMedium) }}
        icon='fa-solid fa-square'
      />
      <span>{count}</span>
      <span>{status.label}</span>
    </div>
  );
};

const RunRow: React.FC<Props> = ({
  run,
  rows,
  comments,
  statuses,
  domain,
  record,
}) => {
  const [expanded, setExpanded] = useState(false);

  const statusCounts = rows.reduce((acc, [, test]) => {
    acc[test.statusId] = (acc[test.statusId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className='run-row'>
        <div className='run-row-column'>
          <Expander expanded={expanded} onClick={setExpanded} />
          <div className='run-stats'>
            <div className='run-title'>
              <span className='mr-2 text-light'>
                <RecordLink record={run} domain={domain} />
              </span>
              {run.name}
            </div>
            <div className='run-stat-row'>
              {Object.keys(statusCounts).map(statusId => (
                <StatusCount
                  status={statuses[statusId]}
                  count={statusCounts[statusId]}
                />
              ))}
            </div>
          </div>
        </div>
        <div className='run-row-column'>
          <div className='text-gray text-small'>
            {getPassedPercentage(rows, statusCounts[PASSED_STATUS_ID] || 0)}%
            complete
          </div>
          <aha-pill color='var(--theme-tertiary-background)'>
            {run.completed ? 'Run complete' : 'Run open'}
          </aha-pill>
          <aha-button
            size='mini'
            kind='icon'
            onClick={() => unlinkRecord(record, run.id, 'runIds')}
          >
            <aha-icon icon='fa-regular fa-trash-can' />
          </aha-button>
        </div>
      </div>
      {expanded &&
        rows.map(([testCase, test]) => (
          <TestRow
            key={test.id}
            testCase={testCase}
            test={test}
            comment={comments[test.id]}
            status={statuses[test.statusId]}
            domain={domain}
            record={record}
            canDelete={false}
          />
        ))}
    </div>
  );
};

export default RunRow;
