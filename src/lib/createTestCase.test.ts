import { IDENTIFIER } from '../extension';
import { fetchTestRail, logResult } from './api';
import { createTestCase } from './createTestCase';

jest.mock('./api', () => ({ fetchTestRail: jest.fn(), logResult: jest.fn() }));

const mockFetch = fetchTestRail as jest.Mock;
const mockLog = logResult as jest.Mock;
const getSetting = jest.fn();
const args = {
  record: {} as Aha.Account,
  eventKey: 'create-result',
  projectId: 1,
  sectionId: 2,
  title: 'New case',
  precondition: 'Precondition',
  steps: 'Steps',
  results: 'Expected',
  reference: ' ABC-1 ',
};

beforeEach(() => {
  jest.resetAllMocks();
  (global as any).aha = { settings: { get: getSetting } };
  getSetting.mockReturnValue(true);
  mockFetch.mockResolvedValue({
    id: 12,
    title: args.title,
    suite_id: 3,
    created_on: 123,
  });
});

it('creates the case and reference in a single request', async () => {
  await createTestCase(args);
  expect(getSetting).toHaveBeenCalledWith(`${IDENTIFIER}.updateReferences`);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith(
    expect.objectContaining({
      path: 'add_case/2',
      method: 'POST',
      body: {
        title: args.title,
        template_id: 1,
        refs: 'ABC-1',
        custom_preconds: args.precondition,
        custom_steps: args.steps,
        custom_expected: args.results,
      },
    })
  );
  expect(mockLog).toHaveBeenCalledWith(
    expect.objectContaining({
      error: false,
      result: {
        kind: 'TestCase',
        id: 12,
        title: args.title,
        projectId: 1,
        suiteId: 3,
        createdOn: 123,
        referenceHandled: true,
      },
    })
  );
});

it.each([false, undefined, 'true'])(
  'omits refs when the server setting is %p',
  async setting => {
    getSetting.mockReturnValue(setting);
    await createTestCase({ ...args, reference: undefined });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0].body).not.toHaveProperty('refs');
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        error: false,
        result: expect.objectContaining({ referenceHandled: true }),
      })
    );
  }
);

it.each([undefined, null, '', '  ', 'ABC-1,ABC-2', 'ABC-1\n', 'ABC-1\r', 123])(
  'rejects invalid reference %p before creating a case',
  async reference => {
    await expect(createTestCase({ ...args, reference } as any)).rejects.toThrow(
      'Invalid test case reference request'
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ error: true })
    );
  }
);

it('preserves API error and rate-limit results without reporting success', async () => {
  mockFetch.mockResolvedValue(null);
  await createTestCase(args);
  expect(mockLog).not.toHaveBeenCalled();
});

it('logs and propagates a failed create without confirming reference handling', async () => {
  mockFetch.mockRejectedValue(new Error('TestRail unavailable'));
  await expect(createTestCase(args)).rejects.toThrow('TestRail unavailable');
  expect(mockLog).toHaveBeenCalledWith(
    expect.objectContaining({ error: true })
  );
  expect(mockLog.mock.calls[0][0]).not.toHaveProperty('result');
});
