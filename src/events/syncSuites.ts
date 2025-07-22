import { IDENTIFIER, Suite } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

type SuiteProps = BaseParams & {
  projectId: string;
  page?: number;
};

// Although some projects only have a single suite, we still fetch them
// for completeness and to avoid extra handling of projects.
const syncSuites: (props: SuiteProps) => void = async ({
  domain,
  record,
  eventKey,
  projectId,
  page,
}) => {
  try {
    console.log(
      `Beginning sync of TestRail suites for project: ${projectId} page: ${page}`
    );

    const params = `&offset=${page ? (page - 1) * 250 : 0}`;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_suites/${projectId}${params}`,
    });

    if (!json) return; // Error already logged

    const suites: Suite[] = json.suites
      .filter(suite => !suite.is_completed)
      .map(suite => ({
        id: suite.id,
        kind: 'Suite',
        projectId: suite.project_id,
        name: truncate(suite.name),
      }));

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: suites, hasMore },
      message: `Successfully fetched ${suites.length} test suites`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching suites: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncSuites` },
  async ({ domain, eventKey, projectId, page }) => {
    await syncSuites({
      domain,
      eventKey,
      projectId,
      page,
      record: aha.account,
    });
  }
);
