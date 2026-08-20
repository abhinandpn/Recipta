import React from 'react';
import { useAppStore } from '../store/appStore';
import { FULLSCREEN_EVENT, getFullscreenState, toggleAppFullscreen } from '../services/fullscreen';
import appLogo from '../assets/images/app-logo.png';
import '../styles/components/layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, setCurrentView, activeProject } = useAppStore();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [gridMenuOpen, setGridMenuOpen] = React.useState(false);
  const [fontMenuOpen, setFontMenuOpen] = React.useState(false);
  const fontMenuRef = React.useRef<HTMLDivElement>(null);

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

  React.useEffect(() => {
    if (!fontMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!fontMenuRef.current?.contains(event.target as Node)) setFontMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [fontMenuOpen]);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('recipta:font-menu-open-change', { detail: fontMenuOpen }));
  }, [fontMenuOpen]);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('recipta:grid-menu-open-change', { detail: gridMenuOpen }));
  }, [gridMenuOpen]);

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
            <div className="toolbar-brand-icon"><img src={appLogo} alt="Recipta logo" /></div>
            <div className="toolbar-brand-copy">
            <span className="toolbar-brand-name">Recipta</span>
            <span className="toolbar-brand-tagline">Print Workspace</span>
          </div>
        </div>

        <nav className="toolbar-nav">
              <button
                type="button"
                className={`toolbar-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentView('dashboard')}
              >
            Dashboard
          </button>
          {activeProject && (
              <button
                type="button"
                className={`toolbar-nav-item ${currentView === 'editor' ? 'active' : ''}`}
                onClick={() => setCurrentView('editor')}
              >
              Editor
            </button>
          )}
          {activeProject && currentView === 'editor' && (
            <div className="toolbar-menu-wrap">
              <button
                type="button"
                className="toolbar-nav-item toolbar-grid-action"
                onClick={() => setGridMenuOpen((open) => !open)}
                title="Grid, snapping, and ruler guide settings"
                aria-haspopup="dialog"
                aria-expanded={gridMenuOpen}
              >
                ▦ Grid
              </button>
            </div>
          )}
          {activeProject && currentView === 'editor' && (
            <div className="toolbar-menu-wrap" ref={fontMenuRef}>
              <button
                type="button"
                className="toolbar-nav-item toolbar-grid-action"
                onClick={() => setFontMenuOpen((open) => !open)}
                title="Font and typography settings"
                aria-haspopup="menu"
                aria-expanded={fontMenuOpen}
                >
                Aa Font
              </button>
              {fontMenuOpen && (
                <div className="toolbar-dropdown toolbar-font-dropdown" role="menu" aria-label="Font menu">
                  <div className="toolbar-dropdown-title">
                    <span>Font &amp; Typography</span>
                    <button type="button" onClick={() => setFontMenuOpen(false)} aria-label="Close font menu">×</button>
                  </div>
                  <div id="toolbar-font-panel-target" className="toolbar-font-panel-target" />
                  <div className="toolbar-dropdown-note">
                    Use this menu to edit font family, size, style, color and alignment.
                  </div>
                </div>
              )}
            </div>
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
                type="button"
                className="toolbar-header-action"
                onClick={() => window.dispatchEvent(new CustomEvent('recipta:show-shortcuts'))}
                title="Keyboard shortcuts (?)"
                aria-label="Open keyboard shortcuts"
              >
                ⌨ <span>Shortcuts</span>
              </button>
              <button
                type="button"
                className="toolbar-header-action"
                onClick={() => window.dispatchEvent(new CustomEvent('recipta:reset-layout'))}
                title="Restore the default panel layout"
                aria-label="Reset workspace layout"
              >
                ↺ <span>Reset Layout</span>
              </button>
            </>
          )}
          <span className="toolbar-version">v0.1.0</span>
          <button type="button" className={`toolbar-fullscreen-button ${isFullscreen ? 'active' : ''}`} onClick={() => void toggleFullscreen()} title="Full screen mode (F)" aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}>
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
