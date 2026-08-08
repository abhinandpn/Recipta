import { useAppStore } from './store/appStore';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';

function App() {
  const { currentView, error, clearError } = useAppStore();

  return (
    <Layout>
      {/* Error Toast */}
      {error && (
        <div className="app-toast app-toast-error">
          <span className="app-toast-icon">!</span>
          <span className="app-toast-message">{error}</span>
          <button onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {/* View Routing */}
      {currentView === 'dashboard' && <Dashboard />}
      {currentView === 'editor' && <Editor />}
    </Layout>
  );
}

export default App;
