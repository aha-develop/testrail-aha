import FeatureTab from '../components/tabs/FeatureTab';
import { isExtensionRecord } from '../lib/extensionRecord';

aha.on('tests', ({ record, fields }, { settings }) => {
  if (!isExtensionRecord(record)) return null;

  return <FeatureTab record={record} fields={fields} settings={settings} />;
});
