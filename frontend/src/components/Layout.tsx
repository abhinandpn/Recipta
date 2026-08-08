import React from 'react';
import { useAppStore } from '../store/appStore';
import '../styles/components/layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, setCurrentView, activeProject } = useAppStore();

  return (
    <div className="app-layout">
      {/* Top Toolbar */}
      <header className="app-toolbar">
        <div className="toolbar-brand">
          <div className="toolbar-brand-icon"><span>Rc</span></div>
          <div className="toolbar-brand-copy">
            <span className="toolbar-brand-name">Recipta</span>
            <span className="toolbar-brand-tagline">Print Workspace</span>
          </div>
        </div>

        <nav className="toolbar-nav">
          <button
            className={`toolbar-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
          {activeProject && (
            <button
              className={`toolbar-nav-item ${currentView === 'editor' ? 'active' : ''}`}
              onClick={() => setCurrentView('editor')}
            >
              Editor
            </button>
          )}
        </nav>

        <div className="toolbar-spacer" />

        {activeProject && (
          <span className="toolbar-project-chip">
            <span className="toolbar-project-dot" />
            {activeProject.name}
          </span>
        )}

        <span className="toolbar-version">v0.1.0</span>
      </header>

      {/* Main Content */}
      <main className="app-content">
        {children}
      </main>

      {/* Status Bar */}
      <footer className="app-statusbar">
        <div className="statusbar-item">
          <span className="statusbar-dot" />
          <span>Ready</span>
        </div>
        <div className="toolbar-spacer" />
        {activeProject && (
          <div className="statusbar-item">
            <span>{activeProject.type === 'receipt' ? 'Receipt / Coupon' : 'Foil / Emboss / Hot-Stamp'}</span>
          </div>
        )}
      </footer>
    </div>
  );
}
