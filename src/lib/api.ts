import { CASE_PREFIX, IDENTIFIER, TestCase } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import base64 from 'base64-js';

const DEFAULT_RETRY_WAIT = '60';

type LogProps = {
  message: string;
  record: ExtensionRecord;
  eventKey: string;
  error: boolean;
};

type SyncTestCaseProps = {
  caseId: string;
  record: ExtensionRecord;
  eventKey: string;
};

const getHeaders: () => Headers = () => {
  const username = aha.settings.get(`${IDENTIFIER}.username`) as
    | string
    | undefined;
  const token = aha.settings.get(`${IDENTIFIER}.token`) as string | undefined;

  if (!username || !token) {
    return null;
  }

  const byteArray = new Uint8Array(
    `${username}:${token}`.split('').map(c => c.charCodeAt(0))
  );

  const authString = `Basic ${base64.fromByteArray(byteArray)}`;

  const headers = new Headers();
  headers.append('Authorization', authString);
  headers.append('Content-Type', 'application/json');

  return headers;
};

export const syncTestCase: (
  SyncTestCaseProps
) => Promise<TestCase | null> = async ({ caseId, record, eventKey }) => {
  try {
    console.log(`Beginning TestRail fetch for Test Case: ${caseId}`);

    const domain = aha.settings.get(`${IDENTIFIER}.domain`) as
      | string
      | undefined;

    if (!domain) {
      await logResult({
        record,
        eventKey,
        error: true,
        message: 'Cannot connect to TestRail, domain not set',
      });
      return null;
    }

    const headers = getHeaders();

    if (!headers) {
      await logResult({
        record,
        eventKey,
        error: true,
        message: 'Cannot connect to TestRail, username or token not set',
      });
      return null;
    }

    console.log('Fetching stored TestRail API retry-at');

    const retryAt = (await aha.account.getExtensionField(
      IDENTIFIER,
      'retryAt'
    )) as number | undefined;

    if (retryAt && retryAt > Date.now()) {
      await logResult({
        record,
        eventKey,
        error: true,
        message: 'API limit reached. Please try again in a few minutes.',
      });
      return null;
    }

    console.log('Fetching test case from TestRail');

    const response = await fetch(
      `https://${domain}.testrail.io/index.php?/api/v2/get_case/${caseId}`,
      {
        method: 'GET',
        headers: headers,
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = parseInt(retryAfter ?? DEFAULT_RETRY_WAIT) * 1000;

        console.log('Storing API retry-at in Aha!');

        aha.account.setExtensionField(
          IDENTIFIER,
          'retryAt',
          Date.now() + retryAfterMs
        );

        await logResult({
          record,
          eventKey,
          error: true,
          message: 'API limit reached. Please try again in a few minutes.',
        });
        return null;
      }

      await logResult({
        record,
        eventKey,
        error: true,
        message: `Error connecting to TestRail: ${response.status} ${response.statusText}`,
      });
      return null;
    }

    const json = await response.json();

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
      `${CASE_PREFIX}${caseId}`,
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

export const logResult: (LogProps) => void = async ({
  message,
  record,
  eventKey,
  error,
}) => {
  // Log first in case storing the field fails
  if (error) {
    console.error(message);
  } else {
    console.log(message);
  }

  console.log('Sending result to Aha!');

  await record.setExtensionField(IDENTIFIER, eventKey, {
    error: error,
    message: message,
  });
};
