import { IDENTIFIER, Status } from '../../extension';
import { BaseSyncProps, waitForLambda } from './interface';
import { saveRecords } from '../extensionFields/updates';

const syncStatuses: (props: BaseSyncProps) => Promise<void> = async ({
  domain,
  logger,
}) => {
  logger('Beginning load of statuses from TestRail');

  const now = Date.now();
  const eventKey = `syncStatuses-${now}`;
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
  await aha.account.setExtensionField(IDENTIFIER, 'lastStatusSync', now);
  logger('Successfully saved all statuses');
};

export default syncStatuses;
