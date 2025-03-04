import { IDENTIFIER, TestCase, Suite } from '../extension';
import { isExtensionRecord } from '../lib/extensionRecord';
import { BaseParams, fetchTestRail, logResult } from '../lib/api';
import { linkRecord, saveRecords } from '../lib/extensionFields/updates';
import { fieldName } from '../lib/extensionFields/queries';
import { truncate } from '../lib/util';

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

    // Fetch the suite to get the project ID
    const suite = await aha.account.getExtensionField<Suite>(
      IDENTIFIER,
      fieldName('Suite', json.suite_id)
    );

    if (!suite) {
      throw new Error(`Could not find suite ${json.suite_id} for case`);
    }

    const testCase: TestCase = {
      id: json.id,
      kind: 'TestCase',
      title: truncate(json.title),
      projectId: suite.projectId,
      suiteId: json.suite_id,
      createdOn: json.created_on,
    };

    console.log('Test case fetched, storing in Aha!');

    await saveRecords<TestCase>([testCase]);

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
      await linkRecord(record, caseId, 'caseIds');

      await logResult({
        record,
        eventKey,
        error: false,
        message: 'Test case successfully linked',
      });
    }
  }
);
