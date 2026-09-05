import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Action } from '{{projectNameKebab}}-shared';
import { useAbility } from '../../lib/use-ability';
import { useCreateProject, useProjects } from './api';

/**
 * The canonical worked example's frontend half — see docs/adding-a-resource.md. `useAbility()`
 * drives the create form's visibility from the exact same CASL rules the API enforces, not a
 * separate hand-maintained FE permission check.
 */
export function ProjectsListPage() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const ability = useAbility();
  const [name, setName] = useState('');

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createProject.mutate(name, { onSuccess: () => setName('') });
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Projects</h1>

      {ability?.can(Action.Create, 'Project') && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New project name"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={createProject.isPending}>
            Create
          </button>
        </form>
      )}

      {isLoading && <p>Loading…</p>}
      {projects?.length === 0 && <p>No projects yet.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {projects?.map((project) => (
          <li key={project.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #ddd' }}>
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
