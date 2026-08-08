import { create } from 'zustand';
import type { Project, AppView, EditorTab, ProjectFull } from '../types';

interface AppState {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // Active project
  activeProject: Project | null;
  activeProjectFull: ProjectFull | null;
  setActiveProject: (project: Project | null) => void;
  setActiveProjectFull: (full: ProjectFull | null) => void;

  // Editor tab (receipt vs foil)
  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;

  // Project list
  projects: Project[];
  setProjects: (projects: Project[]) => void;

  // Recent projects
  recentProjects: Project[];
  setRecentProjects: (projects: Project[]) => void;

  // UI state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Error handling
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),

  // Active project
  activeProject: null,
  activeProjectFull: null,
  setActiveProject: (project) => set({ activeProject: project }),
  setActiveProjectFull: (full) => set({
    activeProjectFull: full,
    activeProject: full?.project ?? null,
  }),

  // Editor tab
  editorTab: 'receipt',
  setEditorTab: (tab) => set({ editorTab: tab }),

  // Project list
  projects: [],
  setProjects: (projects) => set({ projects }),

  // Recent projects
  recentProjects: [],
  setRecentProjects: (projects) => set({ recentProjects: projects }),

  // UI state
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Error handling
  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
