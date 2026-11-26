import { IDENTIFIER, TestCase } from '../extension';
import type { LinkOptions } from './extensionFields/updates';
import { BaseParams, fetchTestRail, logResult } from './api';

// Results prior to v1.6.0 will be missing the LinkOptions handling.
export type CreateTestCaseResult = TestCase & LinkOptions;

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

    const updateReferences =
      aha.settings.get(`${IDENTIFIER}.updateReferences`) === true;

    if (
      updateReferences &&
      (typeof reference !== 'string' ||
        !reference.trim() ||
        /[,\r\n]/.test(reference))
    ) {
      throw new Error('Invalid test case reference request');
    }

    const body = {
      title,
      ...(updateReferences ? { refs: reference?.trim() } : {}),
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
