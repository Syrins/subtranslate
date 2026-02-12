import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { authService } from '../services/api';
import api from '../services/api';

interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  subtitles: any[];
}

export default function Dashboard() {
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await api.get<Project[]>('/projects');
      return data;
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; sourceVideoUrl?: string }) => {
      return api.post('/projects', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowNewProject(false);
      setProjectName('');
      setVideoUrl('');
    },
  });

  const handleLogout = () => {
    authService.logout();
    clearAuth();
    navigate('/login');
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    createProjectMutation.mutate({
      name: projectName,
      sourceVideoUrl: videoUrl || undefined,
    });
  };

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            SubTranslate
          </h1>
          <p style={{ color: '#94a3b8' }}>Welcome, {user?.name || user?.email}</p>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary">
          Logout
        </button>
      </header>

      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setShowNewProject(!showNewProject)}
          className="btn btn-primary"
        >
          + New Project
        </button>
      </div>

      {showNewProject && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Create New Project</h2>
          <form onSubmit={handleCreateProject}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Project Name</label>
              <input
                type="text"
                className="input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                placeholder="My Video Project"
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Video URL (Optional)</label>
              <input
                type="text"
                className="input"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://example.com/video.mkv"
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={createProjectMutation.isPending}>
                {createProjectMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowNewProject(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div>Loading projects...</div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {projects?.map((project) => (
            <div
              key={project.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{project.name}</h3>
              <div style={{ display: 'flex', gap: '1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                <span>Status: {project.status}</span>
                <span>Subtitles: {project.subtitles?.length || 0}</span>
                <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {projects?.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: '#94a3b8' }}>
              No projects yet. Create your first project to get started!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
