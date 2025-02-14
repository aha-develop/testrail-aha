import { TestRun } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';

type RunsForPlanProps = BaseParams & {
  planId: string;
};

const syncTestRunsForPlan: (props: RunsForPlanProps) => void = async ({
  domain,
  record,
  eventKey,
  planId,
}) => {
  try {
    console.log(
      `Beginning sync of TestRail test runs for test plan: ${planId}`
    );

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_plan/${planId}`,
    });

    if (!json) return; // Error already logged

    const testRuns: TestRun[] = [];
    const now = Date.now();

    for (const entry of json.entries) {
      for (const run of entry.runs) {
        testRuns.push({
          id: run.id,
          kind: 'TestRun',
          projectId: run.project_id,
          suiteId: run.suite_id,
          name: run.name,
          lastSynced: now,
        });
      }
    }

    await logResult({
      record,
      eventKey,
      error: false,
      result: testRuns,
      message: `Successfully fetched ${testRuns.length} test runs`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching test plans: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncRunsForPlan` },
  async ({ domain, eventKey, planId }) => {
    await syncTestRunsForPlan({
      record: aha.account,
      domain,
      eventKey,
      planId,
    });
  }
);
