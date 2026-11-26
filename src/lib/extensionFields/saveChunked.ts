import { IDENTIFIER } from '../../extension';

export const MAX_FIELDS_PER_SAVE = 500;

export default async function saveChunked(fields: [string, any][]): Promise<void> {
  for (let i = 0; i < fields.length; i += MAX_FIELDS_PER_SAVE) {
    await aha.account.setExtensionFields(
      IDENTIFIER,
      Object.fromEntries(fields.slice(i, i + MAX_FIELDS_PER_SAVE))
    );
  }
}
