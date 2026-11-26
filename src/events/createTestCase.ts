import { IDENTIFIER } from '../extension';
import { createTestCase, CreateTestCaseParams } from '../lib/createTestCase';

aha.on<CreateTestCaseParams & { domain?: string; eventKey: string }>(
  { event: `${IDENTIFIER}.createTestCase` },
  async ({
    domain,
    eventKey,
    projectId,
    sectionId,
    title,
    precondition,
    steps,
    results,
    reference,
  }) => {
    await createTestCase({
      record: aha.account,
      domain,
      projectId,
      sectionId,
      title,
      precondition,
      steps,
      results,
      reference,
      eventKey,
    });
  }
);
