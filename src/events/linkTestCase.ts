import { IDENTIFIER, TestCase } from '../extension';
import { isExtensionRecord } from '../lib/extensionRecord';
import { BaseParams, fetchTestRail, logResult } from '../lib/api';
import { linkTestCase } from '../lib/extensionFields/updates';
import { fieldName } from '../lib/extensionFields/queries';

type SyncTestCaseProps = BaseParams & {
  caseId: string;
};

const syncTestCase: (
  props: SyncTestCaseProps
) => Promise<TestCase | null> = async ({
  domain,
  caseId,
  record,
  eventKey,
}) => {
  try {
    console.log(`Beginning TestRail fetch for Test Case: ${caseId}`);

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_case/${caseId}`,
    });

    if (!json) return null; // Error already logged

    // TODO: Once we have sprints hooked up to extensions and runs, we can use
    // the record's sprint to get the most recent run for the test case.

    const testCase = {
      id: json.id,
      kind: 'TestCase',
      title: json.title,
      lastSynced: Date.now(),
    } as TestCase;

    console.log(
      `Test case fetched, storing in Aha! ${JSON.stringify(testCase)}`
    );

    aha.account.setExtensionField(
      IDENTIFIER,
      fieldName('TestCase', caseId),
      testCase
    );

    return testCase;
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching test case: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.linkTestCase` },
  async ({ id, typename, domain, caseId, eventKey }) => {
    console.log(`Loading record ${typename}#${id}`);
    const record = await aha.models[typename].select('id').find(id);

    if (!record || !isExtensionRecord(record)) {
      throw new Error('Could not find Aha! record.');
    }

    const result = await syncTestCase({ record, domain, caseId, eventKey });

    if (result) {
      console.log('Linking test case to record');
      await linkTestCase(record, caseId);

      await logResult({
        record,
        eventKey,
        error: false,
        message: 'Test case successfully linked',
      });
    }
  }
);
