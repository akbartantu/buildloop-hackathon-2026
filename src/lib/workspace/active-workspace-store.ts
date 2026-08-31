import { useSyncExternalStore } from "react";

import {
  persistActiveProjectId,
  readStoredActiveProjectId,
  resolveActiveProjectId,
} from "@/lib/workspace/active-project";

type Listener = () => void;

const listeners = new Set<Listener>();

let selectedProjectId: string | null = readStoredActiveProjectId();
let userInitiatedSelection = selectedProjectId !== null;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getSelectedProjectIdSnapshot(): string | null {
  return selectedProjectId;
}

export function subscribeSelectedProjectId(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCanonicalSelectedProjectId(
  projectId: string | null,
  options?: { userInitiated?: boolean },
): void {
  if (options?.userInitiated) {
    userInitiatedSelection = true;
  }
  if (selectedProjectId === projectId) {
    return;
  }
  selectedProjectId = projectId;
  persistActiveProjectId(projectId);
  emit();
}

export function useCanonicalSelectedProjectId(): string | null {
  return useSyncExternalStore(
    subscribeSelectedProjectId,
    getSelectedProjectIdSnapshot,
    () => null,
  );
}

export function reconcileSelectedProjectWithProjects(projects: Array<{ id: string }>): void {
  if (projects.length === 0) {
    return;
  }

  const preferred = selectedProjectId;
  const resolved = resolveActiveProjectId(projects, preferred);
  if (resolved === selectedProjectId) {
    return;
  }

  selectedProjectId = resolved;
  persistActiveProjectId(resolved);
  emit();
}

export function resetActiveWorkspaceStoreForTests(): void {
  selectedProjectId = null;
  userInitiatedSelection = false;
  persistActiveProjectId(null);
  emit();
}
