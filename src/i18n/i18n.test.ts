import { describe, expect, test } from "bun:test";

import { DEFAULT_LOCALE, resolveInitialLocale, translate, persistLocale } from "./index";
import type { TaskStatus } from "@/lib/task-contract";

describe("i18n", () => {
  test("default language is English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(translate("en", "tasks.createTask")).toBe("Create task");
  });

  test("switch to Indonesian", () => {
    expect(translate("id", "tasks.createTask")).toBe("Buat task");
    expect(translate("id", "projects.connectButton")).toBe("Hubungkan repositori");
  });

  test("product tour replay label is localized", () => {
    expect(translate("en", "productTour.replay")).toBe("Replay product tour");
    expect(translate("id", "productTour.replay")).toBe("Putar ulang product tour");
  });

  test("missing key falls back safely to English", () => {
    expect(translate("id", "tasks.createTask" as never)).toBe("Buat task");
    expect(translate("id", "missing.key" as never)).toBe("missing.key");
  });

  test("canonical status values remain unchanged", () => {
    const statuses: TaskStatus[] = ["AWAITING_APPROVAL", "BLOCKED", "PASS", "FAILED"];
    for (const status of statuses) {
      expect(status).toMatch(/^[A-Z_]+$/);
    }
  });

  test("status labels render correctly in both languages", () => {
    expect(translate("en", "status.task.APPROVED_FOR_EXECUTION")).toBe("Approved for execution");
    expect(translate("id", "status.task.AWAITING_APPROVAL")).toBe("Menunggu persetujuan");
    expect(translate("en", "status.task.BLOCKED")).toBe("Blocked");
    expect(translate("id", "status.task.BLOCKED")).toBe("Diblokir");
  });

  test("English home strings contain no known Indonesian leaks", () => {
    const leaks = ["Ringkasan operasional", "Task aktif", "Buat task baru", "Koreksi", "Belum ada"];
    for (const key of [
      "home.title",
      "home.activeTasks",
      "home.createNewTask",
      "home.corrections",
      "home.noneYet",
    ] as const) {
      const value = translate("en", key);
      for (const leak of leaks) {
        expect(value).not.toContain(leak);
      }
    }
  });

  test("raw status enums are not used as user-facing English labels", () => {
    expect(translate("en", "status.task.APPROVED_FOR_EXECUTION")).not.toBe("APPROVED_FOR_EXECUTION");
    expect(translate("en", "status.task.AWAITING_APPROVAL")).not.toBe("AWAITING_APPROVAL");
  });

  test("preference survives refresh reinitialization", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    persistLocale("id");
    expect(resolveInitialLocale()).toBe("id");
    persistLocale("en");
    expect(resolveInitialLocale()).toBe("en");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });
});
