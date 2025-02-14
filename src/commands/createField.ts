// NOT TO BE PUBLISHED IN THE FINAL PACKAGE USED FOR TESTING PURPOSES ONLY
import { IDENTIFIER } from '../extension';
import { fieldName } from '../lib/extensionFields/queries';

async function createTestCase() {
  const id = await aha.commandPrompt('TestCase ID', {
    placeholder: 'Enter the ID of a test case',
  });

  const title = await aha.commandPrompt('Title', {
    placeholder: 'Enter the title of the test case',
  });

  const shouldLinkTest = await aha.commandPrompt('Link to Test?', {
    placeholder: 'Y/N',
    default: 'N',
  });

  let latestTestId;

  if (shouldLinkTest === 'Y') {
    latestTestId = await aha.commandPrompt('Test ID', {
      placeholder: 'Enter the ID of the linked test',
    });
  }

  aha.account.setExtensionField(IDENTIFIER, fieldName('TestCase', id), {
    kind: 'TestCase',
    id,
    title,
    latestTestId,
  });
}

async function createTestRun() {
  const id = await aha.commandPrompt('TestRun ID', {
    placeholder: 'Enter the ID of a test run',
  });

  const name = await aha.commandPrompt('Name', {
    placeholder: 'Enter the name of the test run',
  });

  const hasTestIds = await aha.commandPrompt('Has Test IDs?', {
    placeholder: 'Y/N',
    default: 'N',
  });

  let testIds;

  if (hasTestIds === 'Y') {
    testIds = await aha.commandPrompt('Test IDs', {
      placeholder: 'Enter the IDs of the tests as a comma-separated list',
    });

    testIds = testIds.split(',').map(id => id.trim());
  }

  aha.account.setExtensionField(IDENTIFIER, fieldName('TestRun', id), {
    kind: 'TestRun',
    id,
    name,
    testIds,
  });
}

async function createTest() {
  const id = await aha.commandPrompt('Test ID', {
    placeholder: 'Enter the ID of a test',
  });

  const name = await aha.commandPrompt('Name', {
    placeholder: 'Enter the name of the test',
  });

  const caseId = await aha.commandPrompt('Case ID', {
    placeholder: 'Enter the ID of the linked test case',
  });

  const runId = await aha.commandPrompt('Run ID', {
    placeholder: 'Enter the ID of the linked test run',
  });

  const statusId = await aha.commandPrompt('Status ID', {
    placeholder: 'Enter the ID of the status',
  });

  aha.account.setExtensionField(IDENTIFIER, fieldName('Test', id), {
    kind: 'Test',
    id,
    name,
    caseId,
    runId,
    statusId,
  });
}

async function createStatus() {
  const id = await aha.commandPrompt('Status ID', {
    placeholder: 'Enter the ID of a status',
  });

  const label = await aha.commandPrompt('Label', {
    placeholder: 'Enter the label of the status',
  });

  const color = await aha.commandPrompt('Color', {
    placeholder: 'Enter the color of the status as a hexcode eg #FF0000',
  });

  aha.account.setExtensionField(IDENTIFIER, fieldName('Status', id), {
    kind: 'Status',
    id,
    label,
    color,
  });
}

aha.on('createField', async () => {
  const type = await aha.commandPrompt(
    'What type of field would you like to create?',
    { default: 'TestCase' }
  );

  switch (type) {
    case 'TestCase':
      await createTestCase();
      break;
    case 'TestRun':
      await createTestRun();
      break;
    case 'Test':
      await createTest();
      break;
    case 'Status':
      await createStatus();
      break;
    default:
      aha.commandOutput(`Invalid field type: ${type}`);
      break;
  }
});
