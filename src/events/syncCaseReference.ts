import { IDENTIFIER } from '../extension';
import { CaseReferenceParams, syncCaseReference } from '../lib/caseReferences';

aha.on<CaseReferenceParams & { eventKey: string }>(
  { event: `${IDENTIFIER}.syncCaseReference` },
  async ({ caseId, reference, operation, eventKey }) => {
    await syncCaseReference({
      record: aha.account,
      caseId,
      reference,
      operation,
      eventKey,
    });
  }
);
