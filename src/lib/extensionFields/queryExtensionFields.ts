import { IDENTIFIER } from '../../extension';

// Guard against overloading the GQL by fetching thousands of records at once.
const GQL_BATCH_SIZE = 500;

// This lives in its own file for ease of mocking
const queryExtensionFields: (
  names: string[]
) => Promise<Aha.ExtensionField[]> = async (names: string[]) => {
  const results = await aha.models.ExtensionField.select('name', 'value')
    .where({
      names: names,
      extensionIdentifier: IDENTIFIER,
      extensionFieldableType: 'ACCOUNT',
      extensionFieldableId: aha.account.id,
    })
    .per(GQL_BATCH_SIZE)
    .findInBatches();

  return results;
};

export default queryExtensionFields;
