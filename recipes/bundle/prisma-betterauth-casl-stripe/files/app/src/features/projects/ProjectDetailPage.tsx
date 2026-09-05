import { Link, useNavigate, useParams } from 'react-router-dom';
import { Action } from '{{projectNameKebab}}-shared';
import { useAbility } from '../../lib/use-ability';
import { useDeleteProject, useProject } from './api';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id ?? '');
  const deleteProject = useDeleteProject();
  const ability = useAbility();

  if (isLoading) {
    return <p style={{ fontFamily: 'sans-serif', padding: '2rem' }}>Loading…</p>;
  }
  if (!project) {
    return (
      <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
        <p>Project not found.</p>
        <Link to="/projects">Back to projects</Link>
      </main>
    );
  }

  function handleDelete() {
    if (!id) return;
    deleteProject.mutate(id, { onSuccess: () => navigate('/projects') });
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 480 }}>
      <p>
        <Link to="/projects">← Back to projects</Link>
      </p>
      <h1>{project.name}</h1>
      <p>Created {new Date(project.createdAt).toLocaleString()}</p>

      {ability?.can(Action.Delete, 'Project') && (
        <button onClick={handleDelete} disabled={deleteProject.isPending}>
          {deleteProject.isPending ? 'Deleting…' : 'Delete project'}
        </button>
      )}
    </main>
  );
}
