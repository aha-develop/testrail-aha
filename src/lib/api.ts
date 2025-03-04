import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import base64 from 'base64-js';

export type APIResult = {
  message?: string;
  result?: any;
  error?: boolean;
};

export type PagedAPIResult = {
  message?: string;
  result?: { result: any[]; hasMore: boolean };
  error?: boolean;
};

type LogProps = {
  message: string;
  record: ExtensionRecord;
  eventKey?: string;
  error: boolean;
  result?: any;
};

export type BaseParams = {
  domain: string;
  eventKey?: string;
  record: ExtensionRecord;
};

type FetchParams = BaseParams & {
  path: string;
  method?: string;
  body?: any;
};

export const RETRY_WAIT = 60;
export const TIMEOUT_MESSAGE =
  'API limit reached. Please try again in a few minutes.';

export const logResult: (props: LogProps) => void = async ({
  message,
  record,
  eventKey,
  error,
  result,
}) => {
  // Log first in case storing the field fails
  if (error) {
    console.error(message);
  } else {
    console.log(message);
  }

  if (eventKey) {
    console.log('Sending result to Aha!');

    await record.setExtensionField(IDENTIFIER, eventKey, {
      error: error,
      message: message,
      result: result,
    });
  }
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

export const fetchTestRail: (props: FetchParams) => Promise<any> = async ({
  domain,
  path,
  eventKey,
  record,
  method = 'GET',
  body,
}) => {
  const url = `https://${domain}.testrail.io/index.php?/api/v2/${path}`;

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

  console.log(`Fetching from TestRail - URL: ${url}`);

  const args = {
    method,
    headers,
  };

  args['body'] = body ? JSON.stringify(body) : undefined;

  const response = await fetch(url, args);

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs =
        (retryAfter ? parseInt(retryAfter) : RETRY_WAIT) * 1000;

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
        message: TIMEOUT_MESSAGE,
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

  return await response.json();
};
