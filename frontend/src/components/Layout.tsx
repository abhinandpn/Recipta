import React from 'react';
import { useAppStore } from '../store/appStore';
import { FULLSCREEN_EVENT, getFullscreenState, toggleAppFullscreen } from '../services/fullscreen';
import '../styles/components/layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, setCurrentView, activeProject } = useAppStore();
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const handleFullscreenChange = () => void getFullscreenState().then(setIsFullscreen);
    const handleAppFullscreenChange = (event: Event) => setIsFullscreen(Boolean((event as CustomEvent<boolean>).detail));
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener(FULLSCREEN_EVENT, handleAppFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener(FULLSCREEN_EVENT, handleAppFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      setIsFullscreen(await toggleAppFullscreen());
    } catch (err) {
      console.error('Unable to change full screen mode:', err);
    }
  };

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
          <div
            className="toolbar-center-meta"
            title={activeProject.name}
            aria-label={`Current project: ${activeProject.name}`}
          >
            <span className="toolbar-project-dot" />
            <strong className="toolbar-project-name">{activeProject.name}</strong>
          </div>
        )}

        <div className="toolbar-right-meta">
          {activeProject && currentView === 'editor' && (
            <>
              <button
                className="toolbar-header-action"
                onClick={() => window.dispatchEvent(new CustomEvent('recipta:show-shortcuts'))}
                title="Keyboard shortcuts (?)"
                aria-label="Open keyboard shortcuts"
              >
                ⌨ <span>Shortcuts</span>
              </button>
              <button
                className="toolbar-header-action"
                onClick={() => window.dispatchEvent(new CustomEvent('recipta:reset-layout'))}
                title="Restore the default panel layout"
                aria-label="Reset workspace layout"
              >
                ↺ <span>Reset Layout</span>
              </button>
            </>
          )}
          {activeProject && (
            <span className="toolbar-project-type">
              {activeProject.type === 'receipt' ? 'Receipt / Coupon' : 'Foil / Emboss / Hot-Stamp'}
            </span>
          )}
          <span className="toolbar-version">v0.1.0</span>
          <button className={`toolbar-fullscreen-button ${isFullscreen ? 'active' : ''}`} onClick={() => void toggleFullscreen()} title="Full screen mode (F)" aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}>
            {isFullscreen ? '↙' : '⛶'}
          </button>
        </div>
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
      </footer>
    </div>
  );
}
