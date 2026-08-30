import { describe, expect, test } from "bun:test";

import { collectDevServerStatus, DEV_PORT } from "./dev-server-status";

describe("dev-server-status", () => {
  test("collectDevServerStatus returns structured report", async () => {
    const report = await collectDevServerStatus();
    expect(report.port).toBe(DEV_PORT);
    expect(report.baseUrl).toBe(`http://localhost:${DEV_PORT}`);
    expect(["STARTING", "READY", "UNHEALTHY", "PORT_CONFLICT", "FAILED"]).toContain(report.status);
    expect(report.routes.length).toBeGreaterThan(0);
  });
});
