import React from 'react';
import { TestRailRecord } from '../extension';
import { normalizeSubdomain } from '../lib/api';

type Props = {
  record: TestRailRecord;
  domain: string | undefined;
};

const RecordLink: React.FC<Props> = ({ record, domain }) => {
  const subdomain = normalizeSubdomain(domain);
  if (!subdomain) return null;

  let url;
  let prefix;

  switch (record.kind) {
    case 'TestCase':
      url = `https://${subdomain}.testrail.io/index.php?/cases/view/${record.id}`;
      prefix = 'C';
      break;
    case 'TestRun':
      url = `https://${subdomain}.testrail.io/index.php?/runs/view/${record.id}`;
      prefix = 'R';
      break;
    case 'Test':
      url = `https://${subdomain}.testrail.io/index.php?/tests/view/${record.id}`;
      prefix = 'T';
      break;
    default:
      throw new Error(`Unsupported record type for link: ${record.kind}`);
  }

  return (
    <a href={url} target='_blank' rel='noopener noreferrer'>
      {`${prefix}${record.id}`}
    </a>
  );
};

export default RecordLink;
