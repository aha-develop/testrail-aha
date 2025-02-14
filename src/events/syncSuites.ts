import { IDENTIFIER, Suite } from '../extension';
import { fetchTestRail, logResult, type BaseParams } from '../lib/api';

type SuiteProps = BaseParams & {
  projectId: string;
};

// Note all projects use suites - this should only be called for projects
// that are not operating in single-suite mode (projects where suite_mode !== 1)
const syncSuites: (props: SuiteProps) => void = async ({
  domain,
  record,
  eventKey,
  projectId,
}) => {
  try {
    console.log(`Beginning sync of TestRail suites for project: ${projectId}`);

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_suites/${projectId}`,
    });

    if (!json) return; // Error already logged

    const suites = [] as Suite[];

    for (const suite of json) {
      if (suite.is_completed) continue; // Skip completed (archived) suites - can't be filtered in the request

      suites.push({
        id: suite.id,
        kind: 'Suite',
        name: suite.name,
        projectId: suite.project_id,
      });
    }

    await logResult({
      record,
      eventKey,
      error: false,
      result: suites,
      message: `Successfully fetched ${suites.length} suites`,
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
  async ({ domain, eventKey, projectId }) => {
    await syncSuites({ domain, eventKey, projectId, record: aha.account });
  }
);
