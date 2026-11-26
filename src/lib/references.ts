import { IDENTIFIER } from '../extension';
import { BaseParams, fetchTestRail, logResult } from './api';

export type ReferenceParams = {
  caseId: number;
  reference: string;
};

// The reference field is a comma-separated list of references.
// There's no way to add a single reference through the API.
//
// Because of this, we have to load the current value before updating it,
// to reduce the chance we overwrite existing values.
export const updateReference = async ({
  record,
  eventKey,
  caseId,
  reference,
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
      /[,\r\n]/.test(reference)
    ) {
      throw new Error('Invalid reference update params');
    }

    reference = reference.trim();
    const current = await fetchTestRail({
      record,
      eventKey,
      path: `get_case/${caseId}`,
    });

    // Any failure in fetching the current case will be written to the event key,
    // so just early return.
    if (!current) return;
    if (current.refs === undefined)
      throw new Error('Error parsing references from TestRail');

    const refs: string = current.refs ?? '';
    const tokens = refs.split(',');
    const changed = !tokens.some(token => token.trim() === reference);

    if (changed) {
      const updatedRefs = refs.trim() ? `${refs}, ${reference}` : reference;

      const updated = await fetchTestRail({
        record,
        eventKey,
        path: `update_case/${caseId}`,
        method: 'POST',
        body: { refs: updatedRefs },
      });

      // Again, preserve the error from a failed update
      if (!updated) return;
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
