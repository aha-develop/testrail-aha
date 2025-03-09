import { IDENTIFIER } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';

type TestPlanProps = BaseParams & {
  projectId: string;
};

type SyncActiveTestPlansProps = TestPlanProps & {
  page?: number;
};

type SyncCompletedTestPlansProps = TestPlanProps & {
  limit: number;
};

type SyncTestPlansProps = TestPlanProps & {
  offset?: number;
  completed: 0 | 1;
  limit?: number;
};

const syncActiveTestPlans: (props: SyncActiveTestPlansProps) => void = async ({
  domain,
  record,
  eventKey,
  page,
  projectId,
}) => {
  console.log(
    `Beginning sync of active TestRail test plans for project: ${projectId} page: ${page}`
  );
  const offset = page ? (page - 1) * 250 : 0;

  syncTestPlans({
    domain,
    record,
    eventKey,
    offset,
    projectId,
    completed: 0,
  });
};

const syncCompletedTestPlans: (
  props: SyncCompletedTestPlansProps
) => void = async ({ domain, record, eventKey, limit, projectId }) => {
  console.log(
    `Beginning sync of completed TestRail test plans for project: ${projectId}`
  );

  syncTestPlans({
    domain,
    record,
    eventKey,
    limit,
    projectId,
    completed: 1,
  });
};

const syncTestPlans: (props: SyncTestPlansProps) => void = async ({
  domain,
  record,
  eventKey,
  offset,
  projectId,
  completed,
  limit,
}) => {
  try {
    const params = [`is_completed=${completed}`];

    if (offset) params.push(`offset=${offset}`);
    if (limit) params.push(`limit=${limit}`);

    const path = `get_plans/${projectId}&${params.join('&')}`;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path,
    });

    if (!json) return; // Error already logged

    const planIds = json.plans.map(testPlan => testPlan.id) as string[];
    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: planIds, hasMore },
      message: `Successfully fetched ${planIds.length} test plans`,
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
  { event: `${IDENTIFIER}.syncPlans` },
  async ({ domain, eventKey, page, projectId, isCompleted, limit }) => {
    if (isCompleted === 1) {
      await syncCompletedTestPlans({
        record: aha.account,
        domain,
        eventKey,
        projectId,
        limit,
      });
    } else {
      await syncActiveTestPlans({
        record: aha.account,
        domain,
        eventKey,
        projectId,
        page,
      });
    }
  }
);
