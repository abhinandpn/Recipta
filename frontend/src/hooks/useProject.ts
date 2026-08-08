import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import * as api from '../services/api';
import type { Project } from '../types';

/**
 * Custom hook for project-related operations with loading/error state management.
 */
export function useProject() {
  const {
    setActiveProjectFull,
    setCurrentView,
    setIsLoading,
    setError,
    setProjects,
    setRecentProjects,
  } = useAppStore();

  const openProject = useCallback(async (project: Project) => {
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

  const refreshProjects = useCallback(async () => {
    try {
      const [allProjects, recent] = await Promise.all([
        api.listProjects(),
        api.getRecentProjects(),
      ]);
      setProjects(allProjects || []);
      setRecentProjects(recent || []);
    } catch (err) {
      console.error('Failed to refresh projects:', err);
    }
  }, []);

  const closeProject = useCallback(() => {
    setActiveProjectFull(null);
    setCurrentView('dashboard');
  }, []);

  return {
    openProject,
    refreshProjects,
    closeProject,
  };
}
