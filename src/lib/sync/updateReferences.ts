import { IDENTIFIER } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { APIResult } from '../api';
import { waitForBatchedMutation } from './interface';

// Lower than elsewhere, as each update makes 2 API calls, and we want to limit the chance
// of running into an API timeout as part of a manual process.
const REFERENCE_CONCURRENCY = 5;

export class ReferenceUpdateError extends Error {
  constructor(
    message: string,
    readonly successfulCaseIds: number[]
  ) {
    super(message);
    this.name = 'ReferenceUpdateError';
  }
}

export const updateReferences = async (
  record: ExtensionRecord,
  caseIds: number[]
): Promise<void> => {
  if (
    !caseIds.length ||
    aha.settings.get(`${IDENTIFIER}.updateReferences`) !== true
  ) {
    return;
  }

  if (record.typename === 'Account') {
    throw new Error('Invalid record type to sync reference from');
  }

  const referenceRecord: {
    loadAttributes(name: 'referenceNum'): Promise<void>;
    readonly referenceNum: string | null;
  } = record;

  await referenceRecord.loadAttributes('referenceNum');
  const reference = referenceRecord.referenceNum;

  if (!reference?.trim()) {
    throw new Error('Error retrieving Aha! record reference');
  }

  const uniqueCaseIds = [...new Set(caseIds)];
  const errors: string[] = [];
  const successfulCaseIds: number[] = [];

  for (
    let offset = 0;
    offset < uniqueCaseIds.length;
    offset += REFERENCE_CONCURRENCY
  ) {
    const batch = uniqueCaseIds.slice(offset, offset + REFERENCE_CONCURRENCY);
    const eventKeys = batch.map(
      caseId =>
        `updateReference-${record.id}-${caseId}-${Date.now()}-${Math.random().toString(36).slice(4)}`
    );

    const results = await waitForBatchedMutation<APIResult>({
      eventKeys,
      lambdaFunc: async args => {
        await aha.triggerServer(`${IDENTIFIER}.updateReference`, args);
      },
      argsForKeys: Object.fromEntries(
        eventKeys.map((key, index) => [
          key,
          { caseId: batch[index], reference },
        ])
      ),
    }).catch(error => {
      // Preserve successes from earlier batches if dispatch or polling fails.
      throw new ReferenceUpdateError(
        [...errors, error.message || String(error)].join('\n'),
        successfulCaseIds
      );
    });

    for (const [index, eventKey] of eventKeys.entries()) {
      const result = results[eventKey];

      if (!result || result.error) {
        errors.push(
          `Could not sync reference for test case C${batch[index]}: ${result?.message || 'Unknown error'}`
        );
      } else {
        successfulCaseIds.push(batch[index]);
      }
    }
  }

  if (errors.length > 0) {
    throw new ReferenceUpdateError(errors.join('\n'), successfulCaseIds);
  }
};
