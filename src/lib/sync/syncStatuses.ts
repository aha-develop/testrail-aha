import { IDENTIFIER, Status } from '../../extension';
import { waitForLambda } from './interface';
import { SyncProps, SyncResult } from './bulkSync';
import { saveRecords } from '../extensionFields/updates';

const syncStatuses: (props: SyncProps) => Promise<SyncResult | null> = async ({
  domain,
  logger,
}) => {
  logger('Beginning load of statuses from TestRail');

  const eventKey = 'syncStatuses';
  const args = { domain };
  const lambdaFunc = async args => {
    await aha.triggerServer(`${IDENTIFIER}.syncStatuses`, args);
  };

  const apiResult = await waitForLambda({
    lambdaFunc,
    args,
    eventKey,
  });

  if (apiResult.error) {
    throw new Error(apiResult.message);
  }

  logger('Successfully fetched all statuses');

  logger('Saving statuses to Aha!');
  await saveRecords<Status>(apiResult.result);
  logger('Successfully saved all statuses');

  return null;
};

export default syncStatuses;
