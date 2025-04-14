import { IDENTIFIER } from '../../extension';

// Guard against overloading the GQL by fetching thousands of records at once.
const GQL_BATCH_SIZE = 500;

// This lives in its own file for ease of mocking
const queryExtensionFields: (
  names: string[]
) => Promise<Aha.ExtensionField[]> = async (names: string[]) => {
  const results: Aha.ExtensionField[] = [];

  for (let i = 0; i < names.length; i += GQL_BATCH_SIZE) {
    const chunk = names.slice(i, i + GQL_BATCH_SIZE);

    const result = await aha.models.ExtensionField.select('name', 'value')
      .where({
        names: chunk,
        extensionIdentifier: IDENTIFIER,
        extensionFieldableType: 'ACCOUNT',
        extensionFieldableId: aha.account.id,
      })
      .all();

    results.push(...result);
  }

  return results;
};

export default queryExtensionFields;
