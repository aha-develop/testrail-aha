import React from 'react';
import { Project } from '../../extension';

type Props = {
  projects: Project[];
  projectId: number;
  setProject: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

const SelectProject: React.FC<Props> = ({
  projects,
  projectId,
  setProject,
}) => {
  return (
    <div className='search-select'>
      <div className='search-label'>
        Project
        <span className='label-required'>*</span>
      </div>
      <select name='project' onChange={setProject} style={{ width: '100%' }}>
        {projects.map(project => (
          <option
            key={project.id}
            value={project.id}
            selected={projectId === project.id}
          >
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SelectProject;
