import { IDENTIFIER } from '../extension';
import { BaseParams, fetchTestRail, logResult } from './api';

export type CaseReferenceOperation = 'add' | 'remove';

export type CaseReferenceParams = {
  caseId: number;
  reference: string;
  operation: CaseReferenceOperation;
};

// Each attempt reads fresh references, including retries after a rate limit.
export const syncCaseReference = async ({
  record,
  eventKey,
  caseId,
  reference,
  operation,
}: BaseParams & CaseReferenceParams): Promise<void> => {
  try {
    if (aha.settings.get(`${IDENTIFIER}.syncCaseReferences`) !== true) {
      await logResult({
        record,
        eventKey,
        error: false,
        message: 'Test case reference syncing is disabled',
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
      throw new Error('Invalid test case reference request');
    }

    reference = reference.trim();
    const current = await fetchTestRail({
      record,
      eventKey,
      path: `get_case/${caseId}`,
    });
    if (!current) return; // Preserve the API error, including rate limits.

    if (current.refs !== null && typeof current.refs !== 'string') {
      throw new Error('TestRail returned invalid test case references');
    }

    const refs: string = current.refs ?? '';
    const tokens = refs.split(',');
    const present = tokens.some(token => token.trim() === reference);
    const changed = operation === 'add' ? !present : present;

    if (changed) {
      // Preserve unrelated tokens and their formatting; match whole references.
      const updatedRefs =
        operation === 'add'
          ? refs.trim() ? `${refs}, ${reference}` : reference
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
