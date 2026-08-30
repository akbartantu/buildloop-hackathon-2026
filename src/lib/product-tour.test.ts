import { beforeEach, describe, expect, test } from "bun:test";
import {
  PRODUCT_TOUR_STORAGE_KEY,
  clearProductTourCompleted,
  isProductTourCompleted,
  markProductTourCompleted,
  resolveTourTarget,
  PRODUCT_TOUR_STEPS,
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

describe("resolveTourTarget", () => {
  test("prefers primary target when present", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="tab-contract"></div>`;
    const step = PRODUCT_TOUR_STEPS.find((s) => s.id === "contract");
    expect(step).toBeDefined();
    expect(resolveTourTarget(step!)).toBe("tab-contract");
    document.body.innerHTML = "";
  });

  test("falls back when primary target is missing", () => {
    if (typeof document === "undefined") return;
    document.body.innerHTML = `<div data-tour="nav-tasks"></div>`;
    const step = PRODUCT_TOUR_STEPS.find((s) => s.id === "contract");
    expect(resolveTourTarget(step!)).toBe("nav-tasks");
    document.body.innerHTML = "";
  });
});
