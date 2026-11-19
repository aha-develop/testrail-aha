import { IDENTIFIER } from '../extension';
import { ExtensionRecord } from './extensionRecord';
import base64 from 'base64-js';

export const normalizeSubdomain = (domain: unknown): string | null => {
  if (typeof domain !== 'string') return null;

  // Ensure the input is either a valid DNS label or a TestRail URL, and extract the subdomain.
  const match = domain
    .trim()
    .match(
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
  // Retained for existing event payloads. New requests use the settings.
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
// Recognize older timeout wording too, even when no usable deadline is present.
const TIMEOUT_REGEX = /^API limit reached\.[^\r\n]*?(?: \[retryAt=(\d+)\])?$/;

export const formatTimeoutMessage = (retryAt: number): string =>
  `${TIMEOUT_MESSAGE} [retryAt=${retryAt}]`;

export const isTimeoutMessage = (message?: string): boolean =>
  TIMEOUT_REGEX.test(message ?? '');

export const getTimeoutRetryAt = (message?: string): number => {
  const retryAt = Number(TIMEOUT_REGEX.exec(message ?? '')?.[1]);

  if (
    Number.isSafeInteger(retryAt) &&
    retryAt >= 0 &&
    !Number.isNaN(new Date(retryAt).getTime())
  ) {
    return retryAt;
  }

  // Fallback to a full minute in the case of an unknown retryAt
  return Date.now() + RETRY_WAIT * 1000;
};

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
  const subdomain = normalizeSubdomain(
    aha.settings.get(`${IDENTIFIER}.domain`)
  );
  if (!subdomain) {
    await logResult({
      record,
      eventKey,
      error: true,
      message:
        'Cannot connect to TestRail, configured subdomain is missing or invalid',
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
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '');

      let retryAfterMs = RETRY_WAIT * 1000;

      if (Number.isFinite(retryAfter) && retryAfter >= 0) {
        retryAfterMs = retryAfter * 1000;
      }

      const retryAt = Date.now() + retryAfterMs;
      const timeoutResult: APIResult = {
        error: true,
        message: formatTimeoutMessage(retryAt),
      };

      const retryTime = new Date(retryAt).toISOString().slice(11, 19);
      console.error(`API limit reached. Will retry after ${retryTime} UTC`);

      // Including the retry time in the error removes any potential race here.
      await Promise.all([
        aha.account.setExtensionField(IDENTIFIER, 'retryAt', retryAt),
        record.setExtensionField(IDENTIFIER, eventKey, timeoutResult),
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
