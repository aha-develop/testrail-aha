import { IDENTIFIER } from '../extension';
import { ReferenceParams, updateReference } from '../lib/references';

aha.on<ReferenceParams & { eventKey: string }>(
  { event: `${IDENTIFIER}.updateReference` },
  async ({ caseId, reference, eventKey }) => {
    await updateReference({
      record: aha.account,
      caseId,
      reference,
      eventKey,
    });
  }
);
