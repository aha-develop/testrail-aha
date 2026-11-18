import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import base64 from 'base64-js';

export const normalizeSubdomain = (domain: unknown): string | null => {
  if (typeof domain !== 'string') return null;

  // Accept a DNS label or a TestRail URL, but never arbitrary hosts, userinfo,
  // ports, or backslashes. Build URLs from the captured label only.
  const match = domain.trim().match(
    /^(?:https?:\/\/)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.testrail\.io(?:[/?#][^\s\\]*)?)?$/i
  );
  return match ? match[1].toLowerCase() : null;
};

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
  // Retained for existing event payloads. Authenticated requests ignore this value.
  domain?: string;
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
  'API limit reached. Will retry after the specified time.';

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
  path,
  eventKey,
  record,
  method = 'GET',
  body,
}) => {
  // Resolve the destination on the server before accessing any credentials.
  const subdomain = normalizeSubdomain(aha.settings.get(`${IDENTIFIER}.domain`));
  if (!subdomain) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: 'Cannot connect to TestRail, configured subdomain is missing or invalid',
    });
    return null;
  }

  const url = `https://${subdomain}.testrail.io/index.php?/api/v2/${path}`;

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

  const args: RequestInit = {
    method,
    headers,
    // Do not let a redirect change the destination of an authenticated request.
    redirect: 'error',
  };

  args['body'] = body ? JSON.stringify(body) : undefined;

  const response = await fetch(url, args);

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs =
        (retryAfter ? parseInt(retryAfter) : RETRY_WAIT) * 1000;

      console.log('Storing API retry-at in Aha!');

      // Run both together - we don't want a timeout by waiting for one before the other
      await Promise.all([
        aha.account.setExtensionField(
          IDENTIFIER,
          'retryAt',
          Date.now() + retryAfterMs
        ),
        logResult({
          record,
          eventKey,
          error: true,
          message: TIMEOUT_MESSAGE,
        }),
      ]);

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
