import { ExtensionRecord } from './extensionRecord';
import { linkTests } from './linkTests';
import {
  ReferenceUpdateError,
  updateReferences,
} from './sync/updateReferences';

jest.mock('./sync/updateReferences', () => ({
  ...jest.requireActual('./sync/updateReferences'),
  updateReferences: jest.fn(),
}));

describe('linkTests', () => {
  let fields: Record<string, number[]>;
  let record: ExtensionRecord;
  const selected = [
    { caseId: 1, testId: 11 },
    { caseId: 2, testId: 22 },
    { caseId: 3, testId: 33 },
  ];

  beforeEach(() => {
    fields = { caseIds: [1], testIds: [99] };
    record = {
      getExtensionField: async (_identifier, key) => fields[key],
      setExtensionField: async (_identifier, key, value) => {
        fields[key] = value;
      },
    } as unknown as ExtensionRecord;
    (updateReferences as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('links all selected tests after successful case linking', async () => {
    await linkTests(record, selected);
    expect(fields).toEqual({ caseIds: [1, 2, 3], testIds: [99, 11, 22, 33] });
  });

  it.each([{ successfulCaseIds: [2] }, { successfulCaseIds: [] }])(
    'links tests for confirmed and existing cases before reporting a reference failure: %j',
    async ({ successfulCaseIds }) => {
      const error = new ReferenceUpdateError('C3 failed', successfulCaseIds);
      (updateReferences as jest.Mock).mockRejectedValueOnce(error);

      await expect(linkTests(record, selected)).rejects.toBe(error);
      expect(fields.caseIds).toEqual([1, ...successfulCaseIds]);
      expect(fields.testIds).toEqual(
        successfulCaseIds.length ? [99, 11, 22] : [99, 11]
      );

      await linkTests(record, selected);
      expect(updateReferences).toHaveBeenLastCalledWith(
        record,
        successfulCaseIds.length ? [3] : [2, 3]
      );
      expect(fields.testIds).toEqual([99, 11, 22, 33]);
    }
  );

  it('does not link tests when saving the case links fails', async () => {
    record.setExtensionField = jest.fn().mockRejectedValue(
      new Error('Save failed')
    );
    await expect(linkTests(record, selected)).rejects.toThrow('Save failed');
    expect(fields.testIds).toEqual([99]);
  });
});
