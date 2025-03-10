import React from 'react';
import FeatureTab from '../components/tabs/FeatureTab';
import SprintTab from '../components/tabs/SprintTab';
import { isExtensionRecord } from '../lib/extensionRecord';

aha.on('tests', ({ record, fields }, { settings }) => {
  if (!isExtensionRecord(record)) return null;

  if (record.typename === 'Iteration') {
    return <SprintTab record={record} fields={fields} settings={settings} />;
  }

  return <FeatureTab record={record} fields={fields} settings={settings} />;
});
