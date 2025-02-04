import { syncTestCase } from '../lib/api';
import { linkTestCase } from '../lib/fields';

aha.on(
  { event: 'aha-develop.testrail-aha.linkTestCase' },
  async ({ id, typename, caseId }) => {
    const recordKey = `linkTestCase-${caseId}`;
    const result = await syncTestCase({ id, typename, caseId, recordKey });

    if (result) {
      linkTestCase(id, typename, caseId);
    }
  }
);
