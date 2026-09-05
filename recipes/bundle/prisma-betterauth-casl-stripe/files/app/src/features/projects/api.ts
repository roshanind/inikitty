import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';

export interface Project {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

const projectsKey = ['projects'] as const;

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: () => apiFetch<Project[]>('/projects') });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [...projectsKey, id],
    queryFn: () => apiFetch<Project>(`/projects/${id}`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  });
}
