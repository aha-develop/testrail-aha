import { IDENTIFIER } from '../extension';
import { BaseParams, fetchTestRail, logResult } from './api';

export type ReferenceOperation = 'add' | 'remove';

export type ReferenceParams = {
  caseId: number;
  reference: string;
  operation: ReferenceOperation;
};

// The reference field is a comma-separated list of references.
// There's no way to add/remove a single reference through the API.
//
// Because of this, we have to load the current value before updating it,
// to reduce the chance we overwrite existing values.
export const updateReference = async ({
  record,
  eventKey,
  caseId,
  reference,
  operation,
}: BaseParams & ReferenceParams): Promise<void> => {
  try {
    if (aha.settings.get(`${IDENTIFIER}.updateReferences`) !== true) {
      await logResult({
        record,
        eventKey,
        error: false,
        message: 'Reference syncing is disabled',
      });
      return;
    }

    if (
      !Number.isSafeInteger(caseId) ||
      caseId <= 0 ||
      typeof reference !== 'string' ||
      !reference.trim() ||
      /[,\r\n]/.test(reference) ||
      (operation !== 'add' && operation !== 'remove')
    ) {
      throw new Error('Invalid reference update params');
    }

    reference = reference.trim();
    const current = await fetchTestRail({
      record,
      eventKey,
      path: `get_case/${caseId}`,
    });

    if (!current) throw new Error('Error retrieving current reference');

    const refs: string = current.refs ?? '';
    const tokens = refs.split(',');
    const present = tokens.some(token => token.trim() === reference);
    const changed = operation === 'add' ? !present : present;

    if (changed) {
      const updatedRefs =
        operation === 'add'
          ? refs.trim()
            ? `${refs}, ${reference}`
            : reference
          : tokens
              .filter(token => token.trim() && token.trim() !== reference)
              .join(',');

      const updated = await fetchTestRail({
        record,
        eventKey,
        path: `update_case/${caseId}`,
        method: 'POST',
        body: { refs: updatedRefs },
      });

      if (!updated) throw new Error('Error updating reference');
    }

    await logResult({
      record,
      eventKey,
      error: false,
      result: { changed },
      message: `Successfully synced reference for test case C${caseId}`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Could not sync reference for test case C${caseId}: ${error.message}`,
    });
  }
};
