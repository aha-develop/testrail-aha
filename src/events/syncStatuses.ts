import { IDENTIFIER, Status } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

export const syncStatuses: (props: BaseParams) => Promise<void> = async ({
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
      label: truncate(status.name),
      colorBright: status.color_bright,
      colorMedium: status.color_medium,
      colorDark: status.color_dark,
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
