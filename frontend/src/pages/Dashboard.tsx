import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import * as api from '../services/api';
import type { Project, ProjectType } from '../types';
import '../styles/components/dashboard.css';

export function Dashboard() {
  const {
    projects, setProjects,
    recentProjects, setRecentProjects,
    setActiveProjectFull,
    setCurrentView,
    setIsLoading,
    setError,
  } = useAppStore();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('receipt');

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const [allProjects, recent] = await Promise.all([
        api.listProjects(),
        api.getRecentProjects(),
      ]);
      setProjects(allProjects || []);
      setRecentProjects(recent || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
      // Don't show error on initial load if no projects exist yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    try {
      setIsLoading(true);
      const project = await api.createProject(newProjectName.trim(), newProjectType);
      setShowNewDialog(false);
      setNewProjectName('');

      // Open the new project
      const full = await api.getProjectFull(project.id);
      setActiveProjectFull(full);
      setCurrentView('editor');
    } catch (err) {
      setError(`Failed to create project: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [newProjectName, newProjectType]);

  const handleOpenProject = useCallback(async (project: Project) => {
    try {
      setIsLoading(true);
      const full = await api.getProjectFull(project.id);
      setActiveProjectFull(full);
      setCurrentView('editor');
    } catch (err) {
      setError(`Failed to open project: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDeleteProject = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;

    try {
      await api.deleteProject(id);
      await loadProjects();
    } catch (err) {
      setError(`Failed to delete project: ${err}`);
    }
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">Offline print workspace</span>
          <h1 className="dashboard-title">Create something print-ready.</h1>
          <p className="dashboard-subtitle">
            Import, number, arrange and prepare professional print layouts in one focused workspace.
          </p>
        </div>
        <div className="dashboard-offline-badge"><span /> Fully offline</div>
      </div>

      {/* Action Cards */}
      <div className="dashboard-actions">
        <div
          className="dashboard-action-card"
          onClick={() => {
            setNewProjectType('receipt');
            setShowNewDialog(true);
          }}
        >
          <div className="dashboard-action-icon receipt">📋</div>
          <span className="dashboard-action-title">New Receipt / Coupon</span>
          <span className="dashboard-action-desc">
            Receipts, gift coupons, vouchers, tickets
          </span>
          <span className="dashboard-action-link">Create project <b>→</b></span>
        </div>

        <div
          className="dashboard-action-card"
          onClick={() => {
            setNewProjectType('foil');
            setShowNewDialog(true);
          }}
        >
          <div className="dashboard-action-icon foil">✨</div>
          <span className="dashboard-action-title">New Foil / Emboss</span>
          <span className="dashboard-action-desc">
            Foil stamping, embossing, hot-stamp layouts
          </span>
          <span className="dashboard-action-link">Create project <b>→</b></span>
        </div>

        <div className="dashboard-action-card" onClick={() => { /* TODO: Open file dialog */ }}>
          <div className="dashboard-action-icon open">📂</div>
          <span className="dashboard-action-title">Open Project</span>
          <span className="dashboard-action-desc">
            Open an existing project file
          </span>
          <span className="dashboard-action-link">Browse files <b>→</b></span>
        </div>

        <div className="dashboard-action-card" onClick={() => { /* TODO: Templates */ }}>
          <div className="dashboard-action-icon template">📐</div>
          <span className="dashboard-action-title">Templates</span>
          <span className="dashboard-action-desc">
            Start from a reusable template
          </span>
          <span className="dashboard-action-link">Explore templates <b>→</b></span>
        </div>
      </div>

      {/* Recent Projects */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Recent Projects</h2>

        {recentProjects.length > 0 ? (
          <div className="recent-projects-grid">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                className="recent-project-card"
                onClick={() => handleOpenProject(project)}
              >
                <div className="recent-project-thumb">
                  {project.type === 'receipt' ? '📋' : '✨'}
                </div>
                <div className="recent-project-info">
                  <div className="recent-project-name">{project.name}</div>
                  <div className="recent-project-meta">
                    <span className="recent-project-type">
                      {project.type === 'receipt' ? 'Receipt' : 'Foil'}
                    </span>
                    <span>{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
                <button
                  className="project-delete-button"
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  title={`Delete ${project.name}`}
                  aria-label={`Delete ${project.name}`}
                >
                  <span aria-hidden="true">🗑</span>
                  <span>Delete</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            No recent projects. Create a new project to get started.
          </div>
        )}
      </div>

      {/* All Projects */}
      {projects.length > 0 && (
        <div className="dashboard-section">
          <h2 className="dashboard-section-title">All Projects</h2>
          <div className="recent-projects-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className="recent-project-card"
                onClick={() => handleOpenProject(project)}
              >
                <div className="recent-project-thumb">
                  {project.type === 'receipt' ? '📋' : '✨'}
                </div>
                <div className="recent-project-info">
                  <div className="recent-project-name">{project.name}</div>
                  <div className="recent-project-meta">
                    <span className="recent-project-type">
                      {project.type === 'receipt' ? 'Receipt' : 'Foil'}
                    </span>
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                </div>
                <button
                  className="project-delete-button"
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  title={`Delete ${project.name}`}
                  aria-label={`Delete ${project.name}`}
                >
                  <span aria-hidden="true">🗑</span>
                  <span>Delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Project Dialog */}
      {showNewDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="dialog-title">New Project</h2>

            <div className="dialog-field">
              <label className="dialog-label">Project Name</label>
              <input
                className="input"
                type="text"
                placeholder="Enter project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                autoFocus
              />
            </div>

            <div className="dialog-field">
              <label className="dialog-label">Project Type</label>
              <div className="dialog-type-selector">
                <div
                  className={`dialog-type-option ${newProjectType === 'receipt' ? 'selected' : ''}`}
                  onClick={() => setNewProjectType('receipt')}
                >
                  <span style={{ fontSize: '24px' }}>📋</span>
                  <span className="dialog-type-option-label">Receipt / Coupon</span>
                  <span className="dialog-type-option-desc">Receipts, coupons, vouchers, tickets</span>
                </div>
                <div
                  className={`dialog-type-option ${newProjectType === 'foil' ? 'selected' : ''}`}
                  onClick={() => setNewProjectType('foil')}
                >
                  <span style={{ fontSize: '24px' }}>✨</span>
                  <span className="dialog-type-option-label">Foil / Emboss</span>
                  <span className="dialog-type-option-desc">Foil stamping, embossing, hot-stamp</span>
                </div>
              </div>
            </div>

            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewDialog(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
