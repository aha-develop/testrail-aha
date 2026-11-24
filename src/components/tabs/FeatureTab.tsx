import React, { useEffect, useState } from 'react';
import { FeatureTabData, getFeatureTabData } from '../../lib/featureTabData';
import { timeAgo } from '../../lib/util';
import { Styles } from '../Styles';
import LinkTestRun from '../modals/LinkTestRun';
import LinkTestCase from '../modals/LinkTestCase';
import LinkTest from '../modals/LinkTest';
import CreateTestCase from '../modals/CreateTestCase';
import { ExtensionRecord } from '../../lib/extensionRecord';
import { BulkSyncState, SyncState } from '../../lib/sync/bulkSync';
import waitForBulkSync from '../../lib/sync/waitForBulkSync';
import TestRow from './TestRow';
import RunRow from './RunRow';

type TabProps = {
  record: ExtensionRecord;
  fields: Record<string, unknown>;
  settings: Aha.Settings;
};

const FeatureTab: React.FC<TabProps> = ({ record, fields, settings }) => {
  const caseIds = fields['caseIds'] as number[] | undefined;
  const runIds = fields['runIds'] as number[] | undefined;
  const testIds = fields['testIds'] as number[] | undefined;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<BulkSyncState>(null);
  const isRefreshing =
    syncData?.state === SyncState.Running ||
    syncData?.state === SyncState.Timeout;
  const [tabData, setTabData] = useState<FeatureTabData>(null);

  const [linkRunModalOpen, setLinkRunModalOpen] = useState(false);
  const [linkCaseModalOpen, setLinkCaseModalOpen] = useState(false);
  const [linkTestModalOpen, setLinkTestModalOpen] = useState(false);
  const [createCaseModalOpen, setCreateCaseModalOpen] = useState(false);

  // Used to re-trigger the useEffect and reload the data.
  const [reload, setReload] = useState(0);

  const reloadTabData = () => setReload(reload + 1);

  const onClose = (setter: (value: boolean) => void) => () => setter(false);

  const domain = settings.get('domain') as string | undefined;
  const syncDelay = settings.get('syncDelay') as number | undefined;
  const showLatestTestedResultForCases =
    settings.get('showLatestResult') === true;

  useEffect(() => {
    let active = true;
    const initData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const tabData = await getFeatureTabData(
          caseIds,
          runIds,
          testIds,
          showLatestTestedResultForCases
        );
        if (active) setTabData(tabData);
      } catch (error) {
        if (active) {
          setLoadError(
            error.message || 'Could not load test results. Please try again.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    initData();
    return () => {
      active = false;
    };
  }, [caseIds, runIds, testIds, reload, showLatestTestedResultForCases]);

  useEffect(() => {
    waitForBulkSync({
      domain,
      syncDelay,
      setState: setSyncData,
      reload: reloadTabData,
    });
  }, []);

  let caseRows = null;
  let runRows = null;

  const {
    testCases,
    runs,
    runTestMap,
    tests,
    linkedTests,
    comments,
    statuses,
  } = tabData || {
    testCases: [],
    runs: [],
    runTestMap: {},
    tests: {},
    linkedTests: [],
    comments: {},
    statuses: {},
  };

  // Prevent errors if a linked record was deleted (e.g. from the suite ignore-list)
  const existingCaseIds = testCases.map(testCase => testCase.id);
  const existingRunIds = runs.map(run => run.id);
  const existingTestIds = linkedTests.map(test => test.id);
  const linkedTestIds = new Set(existingTestIds);

  if (testCases.length > 0) {
    caseRows = testCases.map(testCase => {
      const test = tests[testCase.id];
      const status = test && statuses[test.statusId];
      const comment = test ? comments[test.id] : null;

      return (
        <TestRow
          key={`case-${testCase.id}`}
          testCase={testCase}
          test={test}
          inferred={!!test && !linkedTestIds.has(test.id)}
          comment={comment}
          status={status}
          record={record}
          domain={domain}
          syncData={syncData}
        />
      );
    });
  }

  if (runs.length > 0) {
    runRows = runs.map(run => {
      const rows = runTestMap[run.id] ?? [];

      return (
        <RunRow
          key={`run-${run.id}`}
          run={run}
          rows={rows}
          comments={comments}
          statuses={statuses}
          record={record}
          domain={domain}
        />
      );
    });
  }

  return (
    <>
      <Styles />

      <div className='tab-header'>
        <div className='tab-header-left'>
          <div className='h-400'>Tests</div>
          <aha-menu>
            <aha-button kind='secondary' slot='control'>
              <aha-icon icon='fa-regular fa-link' />
              Link a test
            </aha-button>
            <aha-menu-content>
              <aha-menu-item>
                <a onClick={() => setLinkRunModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test run
                </a>
              </aha-menu-item>
              <aha-menu-item>
                <a onClick={() => setLinkTestModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test
                </a>
              </aha-menu-item>
              <aha-menu-item>
                <a onClick={() => setLinkCaseModalOpen(true)}>
                  <aha-icon icon='fa-regular fa-link' />
                  Link a test case
                </a>
              </aha-menu-item>
            </aha-menu-content>
          </aha-menu>
          <aha-button
            kind='secondary'
            onClick={() => setCreateCaseModalOpen(true)}
          >
            <aha-icon icon='fa-regular fa-circle-plus' />
            Create a test case
          </aha-button>
        </div>
        {linkRunModalOpen && (
          <LinkTestRun
            record={record}
            runIds={existingRunIds}
            syncData={syncData}
            onClose={() => setLinkRunModalOpen(false)}
          />
        )}
        {linkCaseModalOpen && (
          <LinkTestCase
            record={record}
            caseIds={existingCaseIds}
            syncData={syncData}
            onClose={onClose(setLinkCaseModalOpen)}
          />
        )}
        {linkTestModalOpen && (
          <LinkTest
            record={record}
            caseIds={existingCaseIds}
            testIds={existingTestIds}
            syncData={syncData}
            onClose={onClose(setLinkTestModalOpen)}
          />
        )}
        {createCaseModalOpen && (
          <CreateTestCase
            domain={domain}
            record={record}
            syncData={syncData}
            onClose={onClose(setCreateCaseModalOpen)}
          />
        )}
        <div className='tab-header-right'>
          {syncData && (
            <>
              <span className='text-small text-light'>
                Last updated: {timeAgo(syncData.lastSync)}
              </span>
              {syncData.state === SyncState.Errored && (
                <span className='text-small text-light text-error'>
                  Failed to sync
                </span>
              )}
              <aha-button
                onClick={() =>
                  waitForBulkSync({
                    domain,
                    syncDelay: 0,
                    setState: setSyncData,
                    reload: reloadTabData,
                  })
                }
                disabled={isRefreshing ? true : null}
                size='mini'
                kind='link'
              >
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </aha-button>
            </>
          )}
        </div>
      </div>
      {loadError && (
        <aha-alert type='danger'>
          {loadError}
          <aha-button kind='link' onClick={reloadTabData}>
            Try again
          </aha-button>
        </aha-alert>
      )}
      {loading ? (
        <div>
          <aha-loading-row rows={5} columns={2} />
        </div>
      ) : (
        <>
          <div className='run-rows mb-3'>{runRows}</div>
          <div>{caseRows}</div>
        </>
      )}
    </>
  );
};

export default FeatureTab;
