"use client";

import { create } from "zustand";

export type AppView = "dashboard" | "editor";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { workflows: number };
}

export interface WorkflowSummary {
  id: string;
  name: string;
  projectId: string;
  updatedAt: string;
}

interface AppState {
  view: AppView;
  activeProject: ProjectSummary | null;
  activeWorkflow: WorkflowSummary | null;
  goDashboard: () => void;
  openEditor: (project: ProjectSummary, workflow: WorkflowSummary) => void;
  setActiveProject: (p: ProjectSummary | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "dashboard",
  activeProject: null,
  activeWorkflow: null,
  goDashboard: () =>
    set({ view: "dashboard", activeWorkflow: null }),
  openEditor: (project, workflow) =>
    set({ view: "editor", activeProject: project, activeWorkflow: workflow }),
  setActiveProject: (p) => set({ activeProject: p }),
}));
