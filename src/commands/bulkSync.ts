import bulkSync from '../lib/sync/bulkSync';

aha.on('bulkSync', async () => {
  await bulkSync(aha.commandOutput, aha.commandPrompt);
});
