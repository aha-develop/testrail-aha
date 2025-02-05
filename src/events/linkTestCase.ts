import { isExtensionRecord } from '../lib/extensionRecord';
import { syncTestCase, logResult } from '../lib/api';
import { linkTestCase } from '../lib/fields';

aha.on(
  { event: 'aha-develop.testrail-aha.linkTestCase' },
  async ({ id, typename, caseId, eventKey }) => {
    const record = await aha.models[typename].select('id').find(id);

    if (!record || !isExtensionRecord(record)) {
      throw new Error(`Could not find record ${typename}#${id}`);
    }

    const result = await syncTestCase({ record, caseId, eventKey });

    if (result) {
      await linkTestCase(record, caseId);

      await logResult({
        record,
        eventKey,
        error: false,
        message: 'Test case successfully linked',
      });
    }
  }
);
