export const ACTIVE_PROJECT_STORAGE_KEY = "buildloop.activeProjectId";

export function readStoredActiveProjectId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function persistActiveProjectId(projectId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (projectId) {
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function resolveActiveProjectId(
  projects: Array<{ id: string }>,
  preferredId: string | null,
): string | null {
  if (projects.length === 0) {
    return null;
  }

  if (projects.length === 1) {
    return projects[0]!.id;
  }

  if (preferredId && projects.some((project) => project.id === preferredId)) {
    return preferredId;
  }

  const stored = readStoredActiveProjectId();
  if (stored && projects.some((project) => project.id === stored)) {
    return stored;
  }

  return projects[0]!.id;
}
