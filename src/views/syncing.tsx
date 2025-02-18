import React from 'react';
import SyncPage from '../components/SyncPage';

aha.on('syncing', (_, { settings }) => {
  const domain = settings.domain as string;

  return <SyncPage domain={domain} />;
});
