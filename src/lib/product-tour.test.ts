import { beforeEach, describe, expect, test } from "bun:test";

import { translate } from "@/i18n/index";
import {
  PRODUCT_TOUR_STEP_DEFS,
  PRODUCT_TOUR_STORAGE_KEY,
  PRODUCT_TOUR_TARGETS,
  buildProductTourSteps,
  clearProductTourCompleted,
  isProductTourCompleted,
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
  test("covers workspace through approval without obsolete welcome/tasks-only flow", () => {
    const ids = PRODUCT_TOUR_STEP_DEFS.map((step) => step.id);
    expect(ids).toEqual([
      "workspace",
      "repository",
      "specifications",
      "create-task",
      "contract",
      "orchestration",
      "evidence",
      "approval",
      "finish",
    ]);
    expect(ids).not.toContain("welcome");
    expect(ids).not.toContain("tasks");
  });

  test("localized steps resolve in English and Indonesian", () => {
    const enSteps = buildProductTourSteps((key) => translate("en", key));
    const idSteps = buildProductTourSteps((key) => translate("id", key));

    expect(enSteps[0]?.title).toBe("Choose your workspace");
    expect(idSteps[0]?.title).toBe("Pilih workspace Anda");
    expect(enSteps[2]?.body).toContain("Spec Kit");
    expect(idSteps[4]?.body).toContain("Sources Used");
    expect(enSteps[6]?.body).toContain("PASS, FAILED, or BLOCKED");
  });

  test("every step title and body key exists in EN and ID catalogs", () => {
    for (const def of PRODUCT_TOUR_STEP_DEFS) {
      expect(translate("en", def.titleKey)).not.toBe(def.titleKey);
      expect(translate("en", def.bodyKey)).not.toBe(def.bodyKey);
      expect(translate("id", def.titleKey)).not.toBe(def.titleKey);
      expect(translate("id", def.bodyKey)).not.toBe(def.bodyKey);
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
});

describe("resolveTourTarget", () => {
  test("prefers primary target when present", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="tab-contract"></div>`;
    const step = buildProductTourSteps((key) => translate("en", key)).find(
      (entry) => entry.id === "contract",
    );
    expect(step).toBeDefined();
    expect(resolveTourTarget(step!)).toBe("tab-contract");
    document.body.innerHTML = "";
  });

  test("falls back when primary target is missing", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="nav-projects"></div>`;
    const step = buildProductTourSteps((key) => translate("en", key)).find(
      (entry) => entry.id === "repository",
    );
    expect(resolveTourTarget(step!)).toBe("nav-projects");
    document.body.innerHTML = "";
  });

  test("resolves specifications panel target when connected workspace has specs", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="projects-specifications"></div>`;
    const step = buildProductTourSteps((key) => translate("en", key)).find(
      (entry) => entry.id === "specifications",
    );
    expect(resolveTourTarget(step!)).toBe("projects-specifications");
    document.body.innerHTML = "";
  });
});
