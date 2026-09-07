import { type FormEvent, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
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
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Projects
      </Typography>

      {ability?.can(Action.Create, 'Project') && (
        <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New project name"
            size="small"
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={createProject.isPending}>
            Create
          </Button>
        </Box>
      )}

      {isLoading && <Typography>Loading…</Typography>}
      {projects?.length === 0 && <Typography color="text.secondary">No projects yet.</Typography>}
      <List disablePadding>
        {projects?.map((project) => (
          <ListItemButton key={project.id} component={RouterLink} to={`/projects/${project.id}`} divider>
            <ListItemText primary={project.name} />
          </ListItemButton>
        ))}
      </List>
    </Container>
  );
}
