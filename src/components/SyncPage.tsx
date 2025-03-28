import React, { useState } from 'react';
import { Styles } from './Styles';
import StatusRow from './syncRows/StatusRow';
import ProjectRow from './syncRows/ProjectRow';
import SuiteRow from './syncRows/SuiteRow';
import SectionRow from './syncRows/SectionRow';
import TestCaseRow from './syncRows/TestCaseRow';
import OpenTestRunRow from './syncRows/OpenTestRunRow';
import CompletedTestRunRow from './syncRows/CompletedTestRunRow';
import OpenTestPlanRow from './syncRows/OpenTestPlanRow';
import CompletedTestPlanRow from './syncRows/CompletedTestPlanRow';
import TestRow from './syncRows/TestRow';
import TestResultRow from './syncRows/TestResultRow';
import BulkSyncPanel from './BulkSyncPanel';
import { SyncType } from '../lib/sync/bulkSync';

const SyncPage: React.FC<{ domain: string }> = ({ domain }) => {
  const [disabled, setDisabled] = useState<boolean>(false);

  return (
    <>
      <Styles />
      <div className='page'>
        <div className='page-nav'>
          <div className='page-nav__row  page-nav__row--justify-left page-nav__row--align-top'>
            <div className='page-nav__cell'>
              <h1>TestRail Connection</h1>
            </div>
          </div>
        </div>
        <div className='sync-background'>
          <div className='sync-page'>
            <div className='mb-4'>
              <div className='h-500'>TestRail data sync</div>
              <div className='mt-2'>
                Check the sync status and manually resync records from TestRail
                to ensure your data is up to date in Aha! Roadmaps.
              </div>
            </div>

            <div className='sync-panel'>
              <div className='sync-panel-header'>
                <div>
                  <div className='h-600'>Individual updates</div>
                  <div className='mt-2'>
                    Choose individual record types to sync only the data you
                    need. This is useful for keeping specific records updated
                    without running a full sync.
                  </div>
                </div>
              </div>
              <div className='sync-panel-content'>
                <div className='sync-panel-top-row'>
                  <span className='text-strong sync-panel-column'>
                    Record type
                  </span>
                  <span className='text-strong sync-panel-column'>
                    Last synced
                  </span>
                </div>

                <StatusRow domain={domain} disabled={disabled} />
                <ProjectRow domain={domain} disabled={disabled} />
                <SuiteRow domain={domain} disabled={disabled} />
                <SectionRow domain={domain} disabled={disabled} />
                <OpenTestRunRow domain={domain} disabled={disabled} />
                <CompletedTestRunRow domain={domain} disabled={disabled} />
                <OpenTestPlanRow domain={domain} disabled={disabled} />
                <CompletedTestPlanRow domain={domain} disabled={disabled} />
                <TestRow domain={domain} disabled={disabled} />
                <TestCaseRow domain={domain} disabled={disabled} />
                <TestResultRow domain={domain} disabled={disabled} />
              </div>
            </div>

            <BulkSyncPanel
              domain={domain}
              type={SyncType.Tests}
              title='Update tests'
              disabled={disabled}
              setDisabled={setDisabled}
            >
              <div>
                This sync ensures all test-related records are fully up to date
                (including syncing projects, test runs, test plans, and tests).
                The process could take some time depending on the volume of
                data.
              </div>
            </BulkSyncPanel>

            <BulkSyncPanel
              domain={domain}
              type={SyncType.Cases}
              title='Update test cases'
              disabled={disabled}
              setDisabled={setDisabled}
            >
              <div>
                This sync ensures all test case-related records are fully
                up-to-date. Includes syncing projects, suites, sections, and
                test cases. This process may take some time, depending on the
                volume of data.
              </div>
            </BulkSyncPanel>

            <BulkSyncPanel
              domain={domain}
              type={SyncType.All}
              title='Full TestRail data resync'
              disabled={disabled}
              setDisabled={setDisabled}
            >
              <div>
                Use this option only when troubleshooting major issues with
                outdated or missing data. Running a full sync will resync all
                records from TestRail, which might take some time depending on
                the volume of data.
              </div>
            </BulkSyncPanel>
          </div>
        </div>
      </div>
    </>
  );
};

export default SyncPage;
