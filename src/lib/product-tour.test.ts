import { beforeEach, describe, expect, test } from "bun:test";

import { translate } from "@/i18n/index";
import {
  GLOBAL_TOUR_STEP_IDS,
  PRODUCT_TOUR_STEP_DEFS,
  PRODUCT_TOUR_STORAGE_KEY,
  PRODUCT_TOUR_TARGETS,
  WORKSPACE_TOUR_STEP_IDS,
  buildProductTourSteps,
  clearProductTourCompleted,
  getProductTourStepDefs,
  isGlobalTourStep,
  isProductTourCompleted,
  isWorkspaceTourStep,
  markProductTourCompleted,
  resolveTourTarget,
} from "./product-tour";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: mock },
    configurable: true,
  });
}

describe("product-tour storage", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  test("marks and reads completion from localStorage", () => {
    clearProductTourCompleted();
    expect(isProductTourCompleted()).toBe(false);
    markProductTourCompleted();
    expect(isProductTourCompleted()).toBe(true);
    expect(localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY)).toBe("true");
    clearProductTourCompleted();
    expect(isProductTourCompleted()).toBe(false);
  });
});

describe("product tour steps", () => {
  test("global /app steps do not target workspace sidebar", () => {
    for (const def of getProductTourStepDefs({ hasWorkspaces: true })) {
      if (!isGlobalTourStep(def.id)) continue;
      expect(def.target).not.toBe("workspace-sidebar");
      expect(def.target).not.toBe("workspace-switcher");
    }
  });

  test("workspace overview is the first step after welcome", () => {
    const ids = getProductTourStepDefs({ hasWorkspaces: true }).map((step) => step.id);
    expect(ids[0]).toBe("welcome");
    expect(ids[1]).toBe("workspace-overview");
  });

  test("existing workspace path guides user to open workspace card", () => {
    const openStep = getProductTourStepDefs({ hasWorkspaces: true }).find(
      (step) => step.id === "open-workspace",
    );
    expect(openStep?.target).toBe("workspace-card");
    expect(openStep?.fallbackTarget).toBe("create-workspace");
    expect(openStep?.bodyKey).toBe("productTour.steps.open-workspace.bodyOpen");
  });

  test("zero-workspace path guides user to create workspace", () => {
    const defs = getProductTourStepDefs({ hasWorkspaces: false });
    const openStep = defs.find((step) => step.id === "open-workspace");
    expect(openStep?.target).toBe("create-workspace");
    expect(openStep?.bodyKey).toBe("productTour.steps.open-workspace.bodyCreate");
    expect(defs.some((step) => step.id === "workspace-shell")).toBe(false);
    expect(defs.some((step) => step.id === "workspace-switcher")).toBe(false);
    expect(defs.at(-1)?.bodyKey).toBe("productTour.steps.finish.bodyNoWorkspace");
  });

  test("workspace-level steps only appear when workspaces exist", () => {
    const withWorkspaces = getProductTourStepDefs({ hasWorkspaces: true });
    const withoutWorkspaces = getProductTourStepDefs({ hasWorkspaces: false });

    for (const stepId of WORKSPACE_TOUR_STEP_IDS) {
      expect(withWorkspaces.some((step) => step.id === stepId)).toBe(true);
      expect(withoutWorkspaces.some((step) => step.id === stepId)).toBe(false);
    }
  });

  test("workspace switcher step explains All workspaces", () => {
    const body = translate("en", "productTour.steps.workspace-switcher.body");
    expect(body).toContain("All workspaces");
    expect(body).toContain("/app");
  });

  test("create-task step targets current task entry points", () => {
    const createStep = PRODUCT_TOUR_STEP_DEFS.find((step) => step.id === "create-task");
    expect(createStep?.target).toBe("task-goal");
    expect(createStep?.fallbackTarget).toBe("create-task");
  });

  test("evidence and approval steps use current UI targets", () => {
    const evidence = PRODUCT_TOUR_STEP_DEFS.find((step) => step.id === "evidence");
    const approval = PRODUCT_TOUR_STEP_DEFS.find((step) => step.id === "approval");
    expect(evidence?.target).toBe("tab-evidence");
    expect(evidence?.fallbackTarget).toBe("nav-runs");
    expect(approval?.target).toBe("nav-approvals");
    expect(approval?.fallbackTarget).toBe("tab-approval");
  });

  test("removes obsolete repository, specifications, contract, and orchestration steps", () => {
    const ids = PRODUCT_TOUR_STEP_DEFS.map((step) => step.id);
    expect(ids).not.toContain("workspace");
    expect(ids).not.toContain("repository");
    expect(ids).not.toContain("specifications");
    expect(ids).not.toContain("contract");
    expect(ids).not.toContain("orchestration");
    expect(ids).toEqual([
      "welcome",
      "workspace-overview",
      "open-workspace",
      "workspace-shell",
      "workspace-switcher",
      "create-task",
      "lifecycle",
      "evidence",
      "approval",
      "finish",
    ]);
  });

  test("localized steps resolve in English and Indonesian", () => {
    const enSteps = buildProductTourSteps((key) => translate("en", key), { hasWorkspaces: true });
    const idSteps = buildProductTourSteps((key) => translate("id", key), { hasWorkspaces: true });

    expect(enSteps[0]?.title).toBe("Welcome to BuildLoop");
    expect(idSteps[0]?.title).toBe("Selamat datang di BuildLoop");
    expect(enSteps[1]?.title).toBe("Your workspaces");
    expect(idSteps[1]?.title).toBe("Workspace Anda");
    expect(enSteps[4]?.body).toContain("All workspaces");
    expect(idSteps[6]?.body).toContain("Planning");
  });

  test("every step title and body key exists in EN and ID catalogs", () => {
    for (const options of [{ hasWorkspaces: true }, { hasWorkspaces: false }] as const) {
      for (const def of getProductTourStepDefs(options)) {
        expect(translate("en", def.titleKey)).not.toBe(def.titleKey);
        expect(translate("en", def.bodyKey)).not.toBe(def.bodyKey);
        expect(translate("id", def.titleKey)).not.toBe(def.titleKey);
        expect(translate("id", def.bodyKey)).not.toBe(def.bodyKey);
      }
    }
  });

  test("step targets use known tour anchors or center placement", () => {
    for (const def of PRODUCT_TOUR_STEP_DEFS) {
      if (def.placement === "center") {
        expect(def.target).toBeUndefined();
        continue;
      }
      expect(def.target).toBeDefined();
      expect(PRODUCT_TOUR_TARGETS).toContain(def.target as (typeof PRODUCT_TOUR_TARGETS)[number]);
      if (def.fallbackTarget) {
        expect(PRODUCT_TOUR_TARGETS).toContain(
          def.fallbackTarget as (typeof PRODUCT_TOUR_TARGETS)[number],
        );
      }
    }
  });

  test("global step ids stay separate from workspace-only ids", () => {
    for (const stepId of GLOBAL_TOUR_STEP_IDS) {
      expect(isGlobalTourStep(stepId)).toBe(true);
      expect(isWorkspaceTourStep(stepId)).toBe(false);
    }
    for (const stepId of WORKSPACE_TOUR_STEP_IDS) {
      expect(isWorkspaceTourStep(stepId)).toBe(true);
      expect(isGlobalTourStep(stepId)).toBe(false);
    }
  });
});

describe("resolveTourTarget", () => {
  test("prefers primary target when present", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="workspace-card"></div>`;
    const step = buildProductTourSteps((key) => translate("en", key), { hasWorkspaces: true }).find(
      (entry) => entry.id === "open-workspace",
    );
    expect(step).toBeDefined();
    expect(resolveTourTarget(step!)).toBe("workspace-card");
    document.body.innerHTML = "";
  });

  test("falls back when primary target is missing", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="create-workspace"></div>`;
    const step = buildProductTourSteps((key) => translate("en", key), { hasWorkspaces: true }).find(
      (entry) => entry.id === "open-workspace",
    );
    expect(resolveTourTarget(step!)).toBe("create-workspace");
    document.body.innerHTML = "";
  });

  test("returns null when neither primary nor fallback target exists", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = "";
    const step = buildProductTourSteps((key) => translate("en", key), { hasWorkspaces: true }).find(
      (entry) => entry.id === "open-workspace",
    );
    expect(resolveTourTarget(step!)).toBeNull();
  });
});
