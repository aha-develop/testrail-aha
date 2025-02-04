import { syncTestCase } from '../lib/api';
import { linkTestCase } from '../lib/fields';

aha.on(
  { event: 'aha-develop.testrail-aha.linkTestCase' },
  async ({ id, typename, caseId, eventKey }) => {
    const result = await syncTestCase({ id, typename, caseId, eventKey });

    if (result) {
      linkTestCase(id, typename, caseId);
    }
  }
);
