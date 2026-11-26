import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import { linkRecords } from './extensionFields/updates';
import { ReferenceUpdateError } from './sync/updateReferences';

export const linkTests = async (
  record: ExtensionRecord,
  selected: { caseId: number; testId: number }[]
): Promise<void> => {
  try {
    await linkRecords(
      record,
      selected.map(({ caseId }) => caseId),
      'caseIds'
    );
  } catch (error) {
    if (error instanceof ReferenceUpdateError) {
      // Continue linking any tests where the case linked successfully (and wasn't simultaneously removed)
      const caseIds = new Set(
        (await record.getExtensionField<number[]>(IDENTIFIER, 'caseIds')) ?? []
      );

      await linkRecords(
        record,
        selected
          .filter(({ caseId }) => caseIds.has(caseId))
          .map(({ testId }) => testId),
        'testIds'
      );
    }
    throw error;
  }

  await linkRecords(
    record,
    selected.map(({ testId }) => testId),
    'testIds'
  );
};
