import React from 'react';
import syncProjects from '../../lib/sync/syncProjects';
import BaseSection, { SectionProps, ResyncProps } from './BaseSection';

const resync: (props: ResyncProps) => Promise<void> = async ({
  domain,
  setLoading,
  setSyncing,
  setLastSync,
  setMessage,
  setError,
}) => {
  try {
    setSyncing(true);
    setLoading(true);

    const now = Date.now();

    await syncProjects({ domain, logger: setMessage });
    await setLastSync(now);
  } catch (error) {
    setMessage(null);
    setError(error.message);
  } finally {
    setLoading(false);
    setSyncing(false);
  }
};

const ProjectSection: React.FC<SectionProps> = ({
  domain,
  disabled,
  setDisabled,
}) => {
  return (
    <BaseSection
      title='Sync projects'
      resync={resync}
      domain={domain}
      disabled={disabled}
      setDisabled={setDisabled}
      syncKey={'lastProjectSync'}
    />
  );
};

export default ProjectSection;
