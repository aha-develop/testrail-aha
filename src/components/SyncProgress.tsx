import React from 'react';
import { BulkSyncState, SyncState, SyncStage } from '../lib/sync/bulkSync';

const messageFromState = (state: BulkSyncState) => {
  if (!state) {
    return 'Syncing statuses - in progress';
  }

  if (state.state === SyncState.Complete) {
    return 'Syncing complete';
  }

  let type;

  switch (state.stage) {
    case SyncStage.Statuses:
      type = 'statuses';
      break;
    case SyncStage.Projects:
      type = 'projects';
      break;
    case SyncStage.Suites:
      type = 'suites';
      break;
    case SyncStage.TestCases:
      type = 'test cases';
      break;
    case SyncStage.OpenRuns:
    case SyncStage.CompletedRuns:
      type = 'test runs';
      break;
    case SyncStage.OpenPlans:
    case SyncStage.CompletedPlans:
      type = 'test plans';
      break;
    case SyncStage.Tests:
      type = 'tests';
      break;
    case SyncStage.Results:
      type = 'test results';
      break;
  }

  if (state.state === SyncState.Errored) {
    return `Syncing ${type} - unknown error occurred`;
  } else if (state.state === SyncState.Timeout) {
    return `Syncing ${type} - waiting for API timeout`;
  } else {
    return `Syncing ${type} - in progress`;
  }
};

const SyncProgress: React.FC<{ syncData: BulkSyncState }> = ({ syncData }) => {
  const error =
    syncData?.state === SyncState.Errored ||
    syncData?.state === SyncState.Timeout;

  const message = messageFromState(syncData);

  return (
    <div className='sync-progress'>
      <div className='sync-message'>
        <span className='text-strong'>Retrieving data:</span>
        <span className={`text-light ${error ? 'text-error' : 'text-gray'}`}>
          {message}
        </span>
      </div>
      <aha-progress-bar
        class='sync-bar' // className isn't valid here
        total={100}
        completed={syncData?.progress || 0}
        no-text
        height='10px'
        units='%'
      />
    </div>
  );
};

export default SyncProgress;
