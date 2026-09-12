import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
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
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography>Loading…</Typography>
      </Container>
    );
  }
  if (!project) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography gutterBottom>Project not found.</Typography>
        <Link component={RouterLink} to="/projects">
          Back to projects
        </Link>
      </Container>
    );
  }

  function handleDelete() {
    if (!id) return;
    deleteProject.mutate(id, { onSuccess: () => navigate('/projects') });
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Link component={RouterLink} to="/projects" sx={{ display: 'inline-block', mb: 2 }}>
        ← Back to projects
      </Link>
      <Typography variant="h4" component="h1" gutterBottom>
        {project.name}
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        Created {new Date(project.createdAt).toLocaleString()}
      </Typography>

      {ability?.can(Action.Delete, 'Project') && (
        <Button
          color="error"
          variant="outlined"
          onClick={handleDelete}
          disabled={deleteProject.isPending}
          sx={{ mt: 2 }}
        >
          {deleteProject.isPending ? 'Deleting…' : 'Delete project'}
        </Button>
      )}
    </Container>
  );
}
