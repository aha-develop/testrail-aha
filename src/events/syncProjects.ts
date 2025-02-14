import { IDENTIFIER, Project } from '../extension';
import { fetchTestRail, logResult, type BaseParams } from '../lib/api';

type SyncProjectsProps = BaseParams & {
  page?: number;
};

const syncProjects: (props: SyncProjectsProps) => void = async ({
  domain,
  record,
  eventKey,
  page,
}) => {
  try {
    console.log(`Beginning sync of TestRail projects page: ${page}`);

    const offset = page ? (page - 1) * 250 : 0;

    const json = await fetchTestRail({
      domain,
      record,
      eventKey,
      path: `get_projects/is_completed=0&offset=${offset}`,
    });

    if (!json) return; // Error already logged

    const projects = json.projects.map(project => ({
      id: project.id,
      kind: 'Project',
      name: project.name,
      suite_mode: project.suite_mode,
    })) as Project[];

    const hasMore = json['_links']?.next !== null;

    await logResult({
      record,
      eventKey,
      error: false,
      result: { result: projects, hasMore },
      message: `Successfully fetched ${projects.length} projects`,
    });
  } catch (error) {
    await logResult({
      record,
      eventKey,
      error: true,
      message: `Unknown error fetching projects: ${error.message}`,
    });

    throw error;
  }
};

aha.on(
  { event: `${IDENTIFIER}.syncProjects` },
  async ({ domain, eventKey, page }) => {
    await syncProjects({ record: aha.account, domain, eventKey, page });
  }
);
