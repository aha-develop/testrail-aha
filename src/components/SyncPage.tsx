import React, { useEffect, useState } from 'react';
import { IDENTIFIER } from '../extension';
import { Styles } from './Styles';
import StatusSection from './syncPageSections/StatusSection';
import ProjectSection from './syncPageSections/ProjectSection';
import SuiteSection from './syncPageSections/SuiteSection';
import SectionSection from './syncPageSections/SectionSection';
import TestCaseSection from './syncPageSections/TestCaseSection';
import OpenTestRunSection from './syncPageSections/OpenTestRunSection';
import CompletedTestRunSection from './syncPageSections/CompletedTestRunSection';
import OpenTestPlanSection from './syncPageSections/OpenTestPlanSection';
import CompletedTestPlanSection from './syncPageSections/CompletedTestPlanSection';
import TestSection from './syncPageSections/TestSection';
import TestResultSection from './syncPageSections/TestResultSection';

const SyncPage: React.FC<{ domain: string }> = ({ domain }) => {
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    async function initRetryAt() {
      const actualRetryAt = await aha.account.getExtensionField<number>(
        IDENTIFIER,
        'retryAt'
      );

      if (actualRetryAt) setRetryAt(actualRetryAt);
    }

    initRetryAt();
  }, []);

  return (
    <>
      <Styles />
      <div className='page'>
        <div className='page-nav'>
          <div className='page-nav__row  page-nav__row--justify-left page-nav__row--align-top'>
            <div className='page-nav__cell'>
              <h1>TestRail Syncing</h1>
            </div>
          </div>
        </div>

        {retryAt && retryAt > Date.now() && (
          <div className='mb-5'>
            <aha-alert type='danger' dismissable>
              API rate limit reached. Please try again in a few minutes
            </aha-alert>
          </div>
        )}
        <div className='sections'>
          <StatusSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <ProjectSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <SuiteSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <SectionSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <TestCaseSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <OpenTestRunSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <CompletedTestRunSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <OpenTestPlanSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <CompletedTestPlanSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <TestSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />

          <TestResultSection
            domain={domain}
            disabled={syncing}
            setDisabled={setSyncing}
          />
        </div>
      </div>
    </>
  );
};

export default SyncPage;
