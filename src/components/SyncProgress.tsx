import React from 'react';
import { BulkSyncState, SyncState, SyncStage } from '../lib/sync/bulkSync';
import { timeAgo } from '../lib/util';

const messageFromState = (state: BulkSyncState) => {
  if (!state) {
    return 'Syncing statuses - in progress';
  }

  if (state.state === SyncState.Complete) {
    return `Syncing complete - last updated: ${timeAgo(state.lastSync)}`;
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
      type = 'test suites';
      break;
    case SyncStage.Sections:
      type = 'sections';
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
      type = 'test comments';
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

  if (syncData?.state === SyncState.Complete) {
    return <div className='text-success'>{message}</div>;
  }

  return (
    <div className='sync-progress'>
      <div className='sync-message'>
        <span className='text-strong'>Retrieving data:</span>
        <span className={`text-light ${error ? 'text-error' : 'text-gray'}`}>
          {message}
        </span>
      </div>
      <aha-progress-bar
        class='sync-bar'
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
