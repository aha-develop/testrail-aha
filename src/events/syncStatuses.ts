import { IDENTIFIER, Status } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';

const syncStatuses: (props: BaseParams) => void = async ({
  domain,
  record,
  eventKey,
}) => {
  try {
    console.log(`Beginning sync of TestRail statuses`);

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: 'get_statuses',
    });

    if (!json) return; // Error already logged

    const statuses = json.map(status => ({
      id: status.id,
      kind: 'Status',
      label: status.name,
      color: status.color_medium,
    })) as Status[];

    await logResult({
      record,
      eventKey,
      error: false,
      result: statuses,
      message: `Successfully fetched ${statuses.length} statuses`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching statuses: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncStatuses` },
  async ({ domain, eventKey }) => {
    await syncStatuses({ domain, eventKey, record: aha.account });
  }
);
