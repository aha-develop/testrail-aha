import { IDENTIFIER, Section } from '../extension';
import { fetchTestRail, logResult, BaseParams } from '../lib/api';
import { truncate } from '../lib/util';

type SyncSectionsProps = BaseParams & {
  projectId: string;
  suiteId?: string;
  page?: number;
};

const syncSections: (props: SyncSectionsProps) => void = async ({
  domain,
  eventKey,
  record,
  projectId,
  suiteId,
  page,
}) => {
  try {
    console.log(
      `Beginning sync of TestRail sections in project: ${projectId}${
        suiteId ? ` and suite: ${suiteId}` : ''
      } page: ${page}`
    );

    const params = [`offset=${page ? (page - 1) * 250 : 0}`];

    if (suiteId) {
      params.unshift(`suite_id=${suiteId}`);
    }

    const path = `get_sections/${projectId}&${params.join('&')}`;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path,
    });

    if (!json) return; // Error already logged

    const sections = json.sections.map(section => ({
      id: section.id,
      kind: 'Section',
      projectId: Number.parseInt(projectId),
      parentId: section.parent_id,
      suiteId: section.suite_id,
      name: truncate(section.name),
    })) as Section[];

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: sections, hasMore },
      message: `Successfully fetched ${sections.length} sections`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching sections: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncSections` },
  async ({ domain, eventKey, page, projectId, suiteId }) => {
    await syncSections({
      record: aha.account,
      domain,
      eventKey,
      page,
      projectId,
      suiteId,
    });
  }
);
