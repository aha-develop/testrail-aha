import { IDENTIFIER, Test } from '../extension';
import { fetchTestRail, logResult, type BaseParams } from '../lib/api';

type SyncTestParams = BaseParams & {
  runId: string;
  page?: number;
  updatedAfter?: number;
};

const syncTests: (props: SyncTestParams) => void = async ({
  record,
  domain,
  eventKey,
  runId,
  page,
  updatedAfter,
}) => {
  try {
    console.log(
      `Beginning sync of TestRail tests for run: ${runId} page: ${page}`
    );

    const offset = page ? (page - 1) * 250 : 0;
    const params = [`offset=${offset}`];

    if (updatedAfter) params.push(`updated_after=${updatedAfter}`);

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_tests/${runId}&${params.join('&')}`,
    });

    if (!json) return; // Error already logged

    const now = Date.now();

    const tests = json.tests.map(test => ({
      id: test.id,
      kind: 'Test',
      caseId: test.case_id,
      runId: test.run_id,
      statusId: test.status_id,
      title: test.title,
      lastSynced: now,
    })) as Test[];

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: tests, hasMore },
      message: `Successfully fetched ${tests.length} tests`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching tests: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncTests` },
  async ({ domain, eventKey, page, runId, updatedAfter }) => {
    await syncTests({
      record: aha.account,
      domain,
      eventKey,
      page,
      runId,
      updatedAfter,
    });
  }
);
