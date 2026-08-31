import { registerHappyDom } from "@/test/register-happy-dom";

registerHappyDom();

import { beforeEach, describe, expect, test } from "bun:test";

import { resolveActiveProjectId } from "@/lib/workspace/active-project";
import {
  getSelectedProjectIdSnapshot,
  reconcileSelectedProjectWithProjects,
  resetActiveWorkspaceStoreForTests,
  setCanonicalSelectedProjectId,
} from "@/lib/workspace/active-workspace-store";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

describe("active workspace store", () => {
  beforeEach(() => {
    resetActiveWorkspaceStoreForTests();
  });

  test("user-initiated selection updates canonical snapshot", () => {
    setCanonicalSelectedProjectId(PROJECT_B, { userInitiated: true });
    expect(getSelectedProjectIdSnapshot()).toBe(PROJECT_B);
  });

  test("reconcile preserves user selection when project exists", () => {
    setCanonicalSelectedProjectId(PROJECT_B, { userInitiated: true });
    reconcileSelectedProjectWithProjects([{ id: PROJECT_A }, { id: PROJECT_B }]);
    expect(getSelectedProjectIdSnapshot()).toBe(PROJECT_B);
  });

  test("reconcile does not reset selection when projects list is empty", () => {
    setCanonicalSelectedProjectId(PROJECT_B, { userInitiated: true });
    reconcileSelectedProjectWithProjects([]);
    expect(getSelectedProjectIdSnapshot()).toBe(PROJECT_B);
  });

  test("resolveActiveProjectId does not read localStorage independently", () => {
    window.localStorage.setItem("buildloop.activeProjectId", PROJECT_B);
    expect(resolveActiveProjectId([{ id: PROJECT_A }, { id: PROJECT_B }], PROJECT_A)).toBe(
      PROJECT_A,
    );
    expect(resolveActiveProjectId([{ id: PROJECT_A }, { id: PROJECT_B }], null)).toBe(PROJECT_A);
  });
});
