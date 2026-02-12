import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useState } from 'react';

interface Subtitle {
  id: string;
  language: string;
  format: string;
  isOriginal: boolean;
  translationService?: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  sourceVideoUrl?: string;
  subtitles: Subtitle[];
  jobs: any[];
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTranslate, setShowTranslate] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [service, setService] = useState<'openai' | 'deepl' | 'gemini'>('openai');
  const [showExport, setShowExport] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    subtitleId: '',
    burnSubtitles: false,
    watermark: false,
    watermarkText: '',
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data } = await api.get<Project>(`/projects/${id}`);
      return data;
    },
  });

  const translateMutation = useMutation({
    mutationFn: async (data: { subtitleId: string; targetLanguage: string; service: string }) => {
      return api.post(`/subtitles/${data.subtitleId}/translate`, {
        targetLanguage: data.targetLanguage,
        service: data.service,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setShowTranslate(false);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (config: any) => {
      return api.post('/jobs/export', { projectId: id, ...config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setShowExport(false);
    },
  });

  const handleTranslate = (e: React.FormEvent) => {
    e.preventDefault();
    translateMutation.mutate({
      subtitleId: selectedSubtitle,
      targetLanguage,
      service,
    });
  };

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();
    exportMutation.mutate(exportConfig);
  };

  if (isLoading) return <div className="container">Loading...</div>;
  if (!project) return <div className="container">Project not found</div>;

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
          ← Back to Projects
        </button>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{project.name}</h1>
        <p style={{ color: '#94a3b8' }}>Status: {project.status}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2>Subtitles</h2>
              <button onClick={() => setShowTranslate(!showTranslate)} className="btn btn-primary">
                + Translate
              </button>
            </div>

            {showTranslate && (
              <form onSubmit={handleTranslate} style={{ marginBottom: '1rem', padding: '1rem', background: '#0f172a', borderRadius: '0.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="label">Select Subtitle</label>
                  <select
                    className="input"
                    value={selectedSubtitle}
                    onChange={(e) => setSelectedSubtitle(e.target.value)}
                    required
                  >
                    <option value="">Choose subtitle...</option>
                    {project.subtitles.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.language} ({sub.format})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="label">Target Language</label>
                  <input
                    type="text"
                    className="input"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    placeholder="e.g., English, Spanish, Japanese"
                    required
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="label">Translation Service</label>
                  <select
                    className="input"
                    value={service}
                    onChange={(e) => setService(e.target.value as any)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="deepl">DeepL</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={translateMutation.isPending}>
                  {translateMutation.isPending ? 'Translating...' : 'Translate'}
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {project.subtitles.map((subtitle) => (
                <div
                  key={subtitle.id}
                  style={{
                    padding: '1rem',
                    background: '#0f172a',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/subtitles/${subtitle.id}/edit`)}
                >
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {subtitle.language} ({subtitle.format})
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                    {subtitle.isOriginal ? 'Original' : `Translated via ${subtitle.translationService}`}
                  </div>
                </div>
              ))}
              {project.subtitles.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                  No subtitles yet
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2>Export</h2>
              <button onClick={() => setShowExport(!showExport)} className="btn btn-primary">
                Export Video
              </button>
            </div>

            {showExport && (
              <form onSubmit={handleExport} style={{ marginBottom: '1rem', padding: '1rem', background: '#0f172a', borderRadius: '0.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="label">Select Subtitle</label>
                  <select
                    className="input"
                    value={exportConfig.subtitleId}
                    onChange={(e) => setExportConfig({ ...exportConfig, subtitleId: e.target.value })}
                    required
                  >
                    <option value="">Choose subtitle...</option>
                    {project.subtitles.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.language} ({sub.format})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={exportConfig.burnSubtitles}
                      onChange={(e) => setExportConfig({ ...exportConfig, burnSubtitles: e.target.checked })}
                    />
                    Burn subtitles into video
                  </label>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={exportConfig.watermark}
                      onChange={(e) => setExportConfig({ ...exportConfig, watermark: e.target.checked })}
                    />
                    Add watermark
                  </label>
                </div>
                {exportConfig.watermark && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="label">Watermark Text</label>
                    <input
                      type="text"
                      className="input"
                      value={exportConfig.watermarkText}
                      onChange={(e) => setExportConfig({ ...exportConfig, watermarkText: e.target.value })}
                      placeholder="Your watermark text"
                    />
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={exportMutation.isPending}>
                  {exportMutation.isPending ? 'Starting export...' : 'Start Export'}
                </button>
              </form>
            )}

            <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Recent Jobs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {project.jobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  style={{
                    padding: '1rem',
                    background: '#0f172a',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {job.type.toUpperCase()} - {job.status}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                    Progress: {job.progress}%
                  </div>
                </div>
              ))}
              {project.jobs.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                  No jobs yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
