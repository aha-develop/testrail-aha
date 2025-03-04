import { IDENTIFIER, TestRun } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

type TestRunProps = BaseParams & {
  projectId: string;
  createdAfter?: number;
};

type SyncActiveTestRunsProps = TestRunProps & {
  page?: number;
};

type SyncCompletedTestRunsProps = TestRunProps & {
  limit: number;
};

type SyncTestRunsProps = TestRunProps & {
  offset?: number;
  completed: 0 | 1;
  limit?: number;
};

const syncActiveTestRuns: (props: SyncActiveTestRunsProps) => void = async ({
  domain,
  record,
  eventKey,
  page,
  projectId,
  createdAfter,
}) => {
  console.log(
    `Beginning sync of active TestRail test runs for project: ${projectId} page: ${page}`
  );
  const offset = page ? (page - 1) * 250 : 0;

  syncTestRuns({
    domain,
    record,
    eventKey,
    offset,
    projectId,
    createdAfter,
    completed: 0,
  });
};

const syncCompletedTestRuns: (
  props: SyncCompletedTestRunsProps
) => void = async ({
  domain,
  record,
  eventKey,
  limit,
  projectId,
  createdAfter,
}) => {
  console.log(
    `Beginning sync of completed TestRail test runs for project: ${projectId}`
  );

  syncTestRuns({
    domain,
    record,
    eventKey,
    limit,
    projectId,
    createdAfter,
    completed: 1,
  });
};

const syncTestRuns: (props: SyncTestRunsProps) => void = async ({
  domain,
  record,
  eventKey,
  offset,
  projectId,
  createdAfter,
  completed,
  limit,
}) => {
  try {
    const params = [`is_completed=${completed}`];

    if (offset) params.push(`offset=${offset}`);
    if (createdAfter) params.push(`created_after=${createdAfter}`);
    if (limit) params.push(`limit=${limit}`);

    const path = `get_runs/${projectId}&${params.join('&')}`;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path,
    });

    if (!json) return; // Error already logged

    const testRuns = json.runs.map(testRun => ({
      id: testRun.id,
      kind: 'TestRun',
      projectId: testRun.project_id,
      suiteId: testRun.suite_id,
      name: truncate(testRun.name),
      createdOn: testRun.created_on,
    })) as TestRun[];

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: testRuns, hasMore },
      message: `Successfully fetched ${testRuns.length} test runs`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching test runs: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncRuns` },
  async ({
    domain,
    eventKey,
    page,
    projectId,
    createdAfter,
    isCompleted,
    limit,
  }) => {
    if (isCompleted === 1) {
      await syncCompletedTestRuns({
        record: aha.account,
        domain,
        eventKey,
        projectId,
        limit,
      });
    } else {
      await syncActiveTestRuns({
        record: aha.account,
        domain,
        eventKey,
        projectId,
        page,
        createdAfter,
      });
    }
  }
);
