import { describe, expect, test } from "bun:test";
import { detectSensitiveIntent } from "./sensitive-intent";

describe("detectSensitiveIntent", () => {
  test("safe workspace copy is not blocked", () => {
    const goal =
      "Perjelas penjelasan workspace agar pengguna baru memahami bahwa task dijalankan di sandbox dan tindakan sensitif membutuhkan approval.";
    expect(detectSensitiveIntent(goal)).toEqual([]);
  });

  test("credential request is blocked with stable reason", () => {
    const reasons = detectSensitiveIntent(
      "Tambahkan deployment otomatis ke production, simpan credential di .env, dan jalankan pada branch main.",
    );
    const rules = reasons.map((reason) => reason.rule);
    expect(rules).toContain("CREDENTIAL_HANDLING");
    expect(rules).toContain("PRODUCTION_DEPLOYMENT");
    expect(rules).toContain("MAIN_BRANCH_WRITE");
    expect(reasons[0]?.explanation.length).toBeGreaterThan(10);
  });

  test("protected env path wording is blocked", () => {
    const reasons = detectSensitiveIntent("Ubah file env aplikasi untuk konfigurasi baru");
    expect(reasons.some((reason) => reason.rule === "PROTECTED_PATH_ENV")).toBe(true);
  });

  test("production deployment request is blocked", () => {
    const reasons = detectSensitiveIntent("Deploy otomatis ke production setelah merge.");
    expect(reasons.some((reason) => reason.rule === "PRODUCTION_DEPLOYMENT")).toBe(true);
  });

  test("protected branch request is blocked", () => {
    const reasons = detectSensitiveIntent("Commit perubahan langsung ke branch main.");
    expect(reasons.some((reason) => reason.rule === "MAIN_BRANCH_WRITE")).toBe(true);
  });
});
