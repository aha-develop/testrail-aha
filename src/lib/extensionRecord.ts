export type ExtensionRecord = (
  | Aha.Epic
  | Aha.Feature
  | Aha.Requirement
  | Aha.Iteration
) &
  Aha.HasExtensionFields;

export function isExtensionRecord(record: any): record is ExtensionRecord {
  const supportedModel =
    'typename' in record &&
    (record.typename === 'Epic' ||
      record.typename === 'Feature' ||
      record.typename === 'Requirement' ||
      record.typename === 'Iteration');

  return supportedModel && 'getExtensionField' in record;
}
