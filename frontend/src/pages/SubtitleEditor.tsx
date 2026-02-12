import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Subtitle {
  id: string;
  language: string;
  format: string;
  content: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  positionX?: number;
  positionY?: number;
}

export default function SubtitleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: subtitle, isLoading } = useQuery({
    queryKey: ['subtitle', id],
    queryFn: async () => {
      const { data } = await api.get<Subtitle>(`/subtitles/${id}`);
      return data;
    },
  });

  const [content, setContent] = useState('');
  const [styles, setStyles] = useState({
    fontFamily: 'Arial',
    fontSize: 24,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2,
    positionX: 50,
    positionY: 90,
  });

  // Update local state when data is loaded
  useState(() => {
    if (subtitle) {
      setContent(subtitle.content);
      setStyles({
        fontFamily: subtitle.fontFamily || 'Arial',
        fontSize: subtitle.fontSize || 24,
        fontColor: subtitle.fontColor || '#FFFFFF',
        outlineColor: subtitle.outlineColor || '#000000',
        outlineWidth: subtitle.outlineWidth || 2,
        positionX: subtitle.positionX || 50,
        positionY: subtitle.positionY || 90,
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Subtitle>) => {
      return api.patch(`/subtitles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtitle', id] });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      content,
      ...styles,
    });
  };

  if (isLoading) return <div className="container">Loading...</div>;
  if (!subtitle) return <div className="container">Subtitle not found</div>;

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
          ← Back
        </button>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          Edit Subtitle - {subtitle.language}
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Content</h2>
          <textarea
            className="input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            style={{ fontFamily: 'monospace', resize: 'vertical' }}
            placeholder="Subtitle content..."
          />
          <button
            onClick={handleSave}
            className="btn btn-primary"
            style={{ marginTop: '1rem', width: '100%' }}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Styling</h2>
            
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Font Family</label>
              <select
                className="input"
                value={styles.fontFamily}
                onChange={(e) => setStyles({ ...styles, fontFamily: e.target.value })}
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Font Size: {styles.fontSize}px</label>
              <input
                type="range"
                min="12"
                max="72"
                value={styles.fontSize}
                onChange={(e) => setStyles({ ...styles, fontSize: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Font Color</label>
              <input
                type="color"
                className="input"
                value={styles.fontColor}
                onChange={(e) => setStyles({ ...styles, fontColor: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Outline Color</label>
              <input
                type="color"
                className="input"
                value={styles.outlineColor}
                onChange={(e) => setStyles({ ...styles, outlineColor: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Outline Width: {styles.outlineWidth}px</label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={styles.outlineWidth}
                onChange={(e) => setStyles({ ...styles, outlineWidth: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Position X: {styles.positionX}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={styles.positionX}
                onChange={(e) => setStyles({ ...styles, positionX: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Position Y: {styles.positionY}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={styles.positionY}
                onChange={(e) => setStyles({ ...styles, positionY: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>Live Preview</h2>
            <div
              style={{
                background: '#000',
                padding: '2rem',
                borderRadius: '0.5rem',
                minHeight: '200px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${styles.positionX}%`,
                  top: `${styles.positionY}%`,
                  transform: 'translate(-50%, -50%)',
                  fontFamily: styles.fontFamily,
                  fontSize: `${styles.fontSize}px`,
                  color: styles.fontColor,
                  textShadow: `
                    -${styles.outlineWidth}px -${styles.outlineWidth}px 0 ${styles.outlineColor},
                    ${styles.outlineWidth}px -${styles.outlineWidth}px 0 ${styles.outlineColor},
                    -${styles.outlineWidth}px ${styles.outlineWidth}px 0 ${styles.outlineColor},
                    ${styles.outlineWidth}px ${styles.outlineWidth}px 0 ${styles.outlineColor}
                  `,
                  whiteSpace: 'pre-wrap',
                }}
              >
                Sample Subtitle Text
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
