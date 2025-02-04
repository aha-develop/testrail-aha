import { IDENTIFIER, TestCase } from '../extension';
import base64 from 'base64-js';

const DEFAULT_RETRY_WAIT = '60';

type LogProps = {
  message: string;
  id: string;
  typename: string;
  eventKey: string;
  error: boolean;
};

type SyncTestCaseProps = {
  testCaseId: string;
  typename: string;
  recordId: string;
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
) => Promise<TestCase | null> = async ({
  testCaseId,
  typename,
  recordId,
  eventKey,
}) => {
  try {
    console.log('Beginning TestRail fetch for Test Case:', testCaseId);

    const domain = aha.settings.get(`${IDENTIFIER}.domain`) as
      | string
      | undefined;

    if (!domain) {
      logResult({
        id: recordId,
        typename,
        eventKey,
        error: true,
        message: 'Cannot connect to TestRail, domain not set',
      });
      return null;
    }

    const headers = getHeaders();

    if (!headers) {
      logResult({
        id: recordId,
        typename,
        eventKey,
        error: true,
        message: 'Cannot connect to TestRail, username or token not set',
      });
      return null;
    }

    const retryAt = (await aha.account.getExtensionField(
      IDENTIFIER,
      'retryAt'
    )) as number | undefined;

    if (retryAt && retryAt > Date.now()) {
      logResult({
        id: recordId,
        typename,
        eventKey,
        error: true,
        message: 'API limit reached. Please try again in a few minutes.',
      });
      return null;
    }

    const url = new URL(
      `https://${domain}.testrail.io/index.php?/api/v2/get_case/${testCaseId}`
    );

    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = parseInt(retryAfter ?? DEFAULT_RETRY_WAIT) * 1000;

        aha.account.setExtensionField(
          IDENTIFIER,
          'retryAt',
          Date.now() + retryAfterMs
        );

        logResult({
          id: recordId,
          typename,
          eventKey,
          error: true,
          message: 'API limit reached. Please try again in a few minutes.',
        });
        return null;
      }

      logResult({
        id: recordId,
        typename,
        eventKey,
        error: true,
        message: `Error connecting to TestRail: ${response.status} ${response.statusText}`,
      });
      return null;
    }

    const json = await response.json();

    logResult({
      id: recordId,
      typename,
      eventKey,
      error: false,
      message: 'Test case successfully fetched',
    });

    // TODO: Once we have sprints hooked up to extensions and runs, we can use
    // the record's sprint to get the most recent run for the test case.

    return {
      id: json.data.id,
      kind: 'TestCase',
      title: json.data.title,
      lastSynced: Date.now(),
    };
  } catch (error) {
    logResult({
      id: recordId,
      typename,
      eventKey,
      error: true,
      message: `Unknown error fetching test case: ${error.message}`,
    });

    throw error;
  }
};

const logResult: (LogProps) => void = ({
  message,
  id,
  typename,
  eventKey,
  error,
}) => {
  // Log first in case storing the field fails
  if (error) {
    console.error(message);
  } else {
    console.log(message);
  }

  const record = aha.models[typename].find(id);
  record.setExtensionField(IDENTIFIER, eventKey, {
    error: error,
    message: message,
  });
};
