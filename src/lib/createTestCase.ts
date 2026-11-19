import { IDENTIFIER, TestCase } from '../extension';
import { BaseParams, fetchTestRail, logResult } from './api';

// Keep the case fields at the top level for clients using the older response.
export type CreateTestCaseResult = TestCase & {
  // True when the server applied the reference or deliberately omitted it
  // because syncing was disabled. Absent on older server responses.
  referenceHandled?: boolean;
};

export type CreateTestCaseParams = {
  projectId: number;
  sectionId: number;
  title: string;
  precondition: string;
  steps: string;
  results: string;
  reference?: string;
};

type CreateProps = BaseParams & CreateTestCaseParams;

export const createTestCase: (props: CreateProps) => Promise<void> = async ({
  domain,
  projectId,
  sectionId,
  title,
  precondition,
  steps,
  results,
  reference,
  record,
  eventKey,
}) => {
  try {
    console.log(
      `Beginning TestRail test case create for section: ${sectionId}`
    );

    const syncReferences =
      aha.settings.get(`${IDENTIFIER}.syncCaseReferences`) === true;
    if (
      syncReferences && (
        typeof reference !== 'string' ||
        !reference.trim() ||
        /[,\r\n]/.test(reference)
      )
    ) {
      throw new Error('Invalid test case reference request');
    }

    const body = {
      title,
      ...(syncReferences ? { refs: reference.trim() } : {}),
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

    if (!json) return; // Preserve API errors so the coordinator can retry rate limits.

    const testCase: CreateTestCaseResult = {
      id: json.id,
      kind: 'TestCase',
      title: json.title,
      projectId,
      suiteId: json.suite_id,
      createdOn: json.created_on,
      referenceHandled: true,
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
