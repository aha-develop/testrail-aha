import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import { waitForLambda } from './sync/interface';
import { APIResult } from './api';
import type { CreateTestCaseResult } from './createTestCase';
import { saveRecords, linkRecord } from './extensionFields/updates';

type CreateProps = {
  record: ExtensionRecord;
  domain: string;
  title: string;
  precondition: string;
  steps: string;
  results: string;
  sectionId: string;
  projectId: string;
};

const createTestCase = async ({
  record,
  domain,
  title,
  precondition,
  steps,
  results,
  sectionId,
  projectId,
}: CreateProps): Promise<CreateTestCaseResult> => {
  const sectionIdNum = Number.parseInt(sectionId);
  const projectIdNum = Number.parseInt(projectId);

  const eventKey = `createTestCase-${Date.now()}`;

  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.createTestCase`, args);
  };

  if (record.typename === 'Account') {
    throw new Error('Cannot create a linked test case for an account');
  }
  // Always send the reference: the server decides using the current setting,
  // even if this browser page still has an older settings snapshot.
  const referenceRecord: {
    loadAttributes(name: 'referenceNum'): Promise<void>;
    readonly referenceNum: string | null;
  } = record;
  await referenceRecord.loadAttributes('referenceNum');

  const args = {
    reference: referenceRecord.referenceNum,
    domain,
    title,
    precondition,
    steps,
    results,
    sectionId: sectionIdNum,
    projectId: projectIdNum,
  };

  const result = await waitForLambda<APIResult>({ lambdaFunc, args, eventKey });

  if (!result || result.error) {
    throw new Error(result?.message || 'Could not create test case');
  }

  return result.result as CreateTestCaseResult;
};

// Keep a successful create in the dialog's ref before any local saves. Retrying
// a failed save/link must reuse the case and the server's reference decision.
export const createAndLinkTestCase = async (
  props: CreateProps,
  createdCase: { current: CreateTestCaseResult | null }
): Promise<void> => {
  if (!createdCase.current) {
    createdCase.current = await createTestCase(props);
  }

  const { referenceHandled, ...testCase } = createdCase.current;
  await saveRecords([testCase]);
  await linkRecord(props.record, testCase.id, 'caseIds', {
    referenceHandled: referenceHandled === true,
  });
};
