import { IDENTIFIER, TestCase } from '../extension';
import { BaseParams, fetchTestRail, logResult } from '../lib/api';

type CreateProps = BaseParams & {
  projectId: number;
  sectionId: number;
  title: string;
  precondition: string;
  steps: string;
  results: string;
};

const createTestCase: (props: CreateProps) => Promise<void> = async ({
  domain,
  projectId,
  sectionId,
  title,
  precondition,
  steps,
  results,
  record,
  eventKey,
}) => {
  try {
    console.log(
      `Beginning TestRail test case create for section: ${sectionId}`
    );

    const body = {
      title,
      template_id: 1,
      custom_preconds: precondition,
      custom_steps: steps,
      custom_expected: results,
    };

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      body,
      path: `add_case/${sectionId}`,
      method: 'POST',
    });

    const testCase: TestCase = {
      id: json.id,
      kind: 'TestCase',
      title: json.title,
      projectId,
      suiteId: json.suite_id,
      createdOn: json.createdOn,
    };

    await logResult({
      record,
      eventKey,
      error: false,
      result: testCase,
      message: `Successfully created test case`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error creating test case: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
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
      eventKey,
    });
  }
);
