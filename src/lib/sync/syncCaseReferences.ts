import { IDENTIFIER } from '../../extension';
import { ExtensionRecord } from '../extensionRecord';
import { APIResult } from '../api';
import type { CaseReferenceOperation } from '../caseReferences';
import { waitForLambda } from './interface';

let requestSequence = 0;

export const syncCaseReferences = async (
  record: ExtensionRecord,
  caseIds: number[],
  operation: CaseReferenceOperation
): Promise<void> => {
  if (
    !caseIds.length ||
    aha.settings.get(`${IDENTIFIER}.syncCaseReferences`) !== true
  ) {
    return;
  }

  if (record.typename === 'Account') {
    throw new Error('Cannot sync a test case reference for an account');
  }

  const referenceRecord: {
    loadAttributes(name: 'referenceNum'): Promise<void>;
    readonly referenceNum: string | null;
  } = record;
  await referenceRecord.loadAttributes('referenceNum');
  const reference = referenceRecord.referenceNum;
  if (!reference?.trim()) {
    throw new Error('Could not load the Aha! record reference');
  }

  // Bound API traffic and give each operation its own result field, including
  // simultaneous operations on different Aha! records or in different tabs.
  for (const caseId of new Set(caseIds)) {
    const eventKey = `syncCaseReference-${record.id}-${caseId}-${Date.now()}-${++requestSequence}-${Math.random().toString(36).slice(2)}`;
    const result = await waitForLambda<APIResult>({
      eventKey,
      lambdaFunc: async args => {
        await aha.triggerServer(`${IDENTIFIER}.syncCaseReference`, args);
      },
      args: { caseId, reference, operation },
    });

    if (!result || result.error) {
      throw new Error(
        result?.message || `Could not sync reference for test case C${caseId}`
      );
    }
  }
};
