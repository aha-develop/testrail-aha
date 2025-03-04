import { IDENTIFIER, TestCase } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

type SyncTestCasesProps = BaseParams & {
  projectId: string;
  suiteId?: string;
  updatedAfter?: number;
  page?: number;
};

const syncTestCases: (props: SyncTestCasesProps) => void = async ({
  domain,
  eventKey,
  record,
  projectId,
  suiteId,
  updatedAfter,
  page,
}) => {
  try {
    console.log(
      `Beginning sync of TestRail test cases in project: ${projectId}${
        suiteId ? ` and suite: ${suiteId}` : ''
      } page: ${page}`
    );

    const params = [`offset=${page ? (page - 1) * 250 : 0}`];

    if (updatedAfter) {
      params.push(`updated_after=${updatedAfter}`);
    }
    if (suiteId) {
      params.unshift(`suite_id=${suiteId}`); // Has to be the first param after projectId
    }

    const path = `get_cases/${projectId}&${params.join('&')}`;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path,
    });

    if (!json) return; // Error already logged

    const cases: TestCase[] = json.cases.map(testCase => ({
      id: testCase.id,
      kind: 'TestCase',
      projectId: Number.parseInt(projectId), // Test cases API call doesn't return project ID
      suiteId: testCase.suite_id,
      title: truncate(testCase.title),
      createdOn: testCase.created_on,
    }));

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: cases, hasMore },
      message: `Successfully fetched ${cases.length} test cases`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching test cases: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncCases` },
  async ({ domain, eventKey, page, projectId, suiteId, updatedAfter }) => {
    await syncTestCases({
      record: aha.account,
      domain,
      eventKey,
      page,
      projectId,
      suiteId,
      updatedAfter,
    });
  }
);
