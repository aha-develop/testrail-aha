import { IDENTIFIER, TestResult } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

type SyncResultParams = BaseParams & {
  runId: string;
  page?: number;
  createdAfter?: number;
};

// We only care about the latest comment, but we have to load results to get them
// and it's less API calls to get an entire run's results and glue them to the tests
// than to get each test's results individually
export const syncTestResults: (props: SyncResultParams) => void = async ({
  record,
  domain,
  eventKey,
  runId,
  page,
  createdAfter,
}) => {
  try {
    console.log(`Beginning sync of TestRail results for run: ${runId}`);

    const offset = page ? (page - 1) * 250 : 0;
    const params = [`offset=${offset}`];

    if (createdAfter) params.push(`created_after=${createdAfter}`);

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_results_for_run/${runId}&${params.join('&')}`,
    });

    if (!json) return; // Error already logged

    const results = json.results.map(result => ({
      id: result.id,
      kind: 'TestResult',
      testId: result.test_id,
      comment: truncate(result.comment),
      createdOn: result.created_on,
    })) as TestResult[];

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: results, hasMore },
      message: `Successfully fetched ${results.length} test results`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching test results: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncResults` },
  async ({ domain, eventKey, page, runId, createdAfter }) => {
    await syncTestResults({
      record: aha.account,
      domain,
      eventKey,
      page,
      runId,
      createdAfter,
    });
  }
);
