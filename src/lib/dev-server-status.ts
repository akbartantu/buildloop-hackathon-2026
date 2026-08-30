import { spawn } from "node:child_process";
import net from "node:net";

export const DEV_PORT = Number(process.env["BUILDLOOP_DEV_PORT"] ?? 8080);
export const BASE_URL = process.env["BUILDLOOP_DEV_URL"] ?? `http://localhost:${DEV_PORT}`;
export const READINESS_TIMEOUT_MS = Number(process.env["BUILDLOOP_DEV_READY_TIMEOUT_MS"] ?? 60_000);
export const REQUEST_TIMEOUT_MS = Number(process.env["BUILDLOOP_DEV_REQUEST_TIMEOUT_MS"] ?? 8_000);
const POLL_INTERVAL_MS = 1_000;

export const HEALTH_ROUTES = ["/health", "/", "/auth", "/auth/sign-up"] as const;

export type DevServerStatus =
  | "STARTING"
  | "READY"
  | "UNHEALTHY"
  | "FAILED"
  | "PORT_CONFLICT";

export type RouteProbe = {
  path: string;
  status: number | null;
  ms: number | null;
  error: string | null;
};

export type StatusReport = {
  status: DevServerStatus;
  port: number;
  baseUrl: string;
  portListening: boolean;
  portConflict: boolean;
  portOwnerPid: number | null;
  startupMs: number | null;
  routes: RouteProbe[];
  message: string;
  timestamp: string;
};

export function logDevStatus(message: string) {
  console.log(`[BuildLoop] ${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probePort(port: number): Promise<{ listening: boolean; pid: number | null }> {
  const listening = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(1_500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });

  if (!listening) {
    return { listening: false, pid: null };
  }

  const pid = await findPortOwnerPid(port);
  return { listening: true, pid };
}

async function findPortOwnerPid(port: number): Promise<number | null> {
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const proc = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
      ]);
      let output = "";
      proc.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      proc.on("close", () => {
        const pid = Number(output.trim());
        resolve(Number.isFinite(pid) && pid > 0 ? pid : null);
      });
      proc.on("error", () => resolve(null));
    });
  }

  return new Promise((resolve) => {
    const proc = spawn("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    let output = "";
    proc.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const pid = Number(output.trim().split("\n")[0]);
      resolve(Number.isFinite(pid) && pid > 0 ? pid : null);
    });
    proc.on("error", () => resolve(null));
  });
}

async function probeRoute(path: string): Promise<RouteProbe> {
  const url = `${BASE_URL}${path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
    return {
      path,
      status: response.status,
      ms: Date.now() - started,
      error: null,
    };
  } catch (error) {
    return {
      path,
      status: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function deriveStatus(input: {
  portListening: boolean;
  portConflict: boolean;
  routes: RouteProbe[];
  processAlive?: boolean;
}): DevServerStatus {
  if (input.portConflict) return "PORT_CONFLICT";
  if (input.processAlive === false) return "FAILED";
  if (!input.portListening) return "STARTING";

  const coreRoutes = input.routes.filter((route) => route.path !== "/health");
  const allCoreOk = coreRoutes.every(
    (route) => route.status !== null && route.status >= 200 && route.status < 400,
  );
  if (allCoreOk) return "READY";

  const anyResponded = input.routes.some((route) => route.status !== null);
  return anyResponded ? "UNHEALTHY" : "STARTING";
}

function buildMessage(status: DevServerStatus): string {
  switch (status) {
    case "PORT_CONFLICT":
      return `Port ${DEV_PORT} is already in use by another process.`;
    case "FAILED":
      return "Dev server process is not running.";
    case "STARTING":
      return "Dev server is starting — port not ready or routes not responding yet.";
    case "UNHEALTHY":
      return "Port is open but one or more routes failed or timed out.";
    case "READY":
      return `Dev server is ready at ${BASE_URL}.`;
    default:
      return "";
  }
}

export async function collectDevServerStatus(options?: {
  expectPortInUse?: boolean;
  startupMs?: number | null;
}): Promise<StatusReport> {
  const { listening, pid } = await probePort(DEV_PORT);
  const routes: RouteProbe[] = listening
    ? await Promise.all(HEALTH_ROUTES.map((path) => probeRoute(path)))
    : HEALTH_ROUTES.map((path) => ({ path, status: null, ms: null, error: "port closed" }));

  const status = deriveStatus({
    portListening: listening,
    portConflict: false,
    routes,
    ...(options?.expectPortInUse !== undefined
      ? { processAlive: options.expectPortInUse ? listening : false }
      : {}),
  });

  return {
    status,
    port: DEV_PORT,
    baseUrl: BASE_URL,
    portListening: listening,
    portConflict: false,
    portOwnerPid: pid,
    startupMs: options?.startupMs ?? null,
    routes,
    message: buildMessage(status),
    timestamp: new Date().toISOString(),
  };
}

export async function waitForDevServerReady(): Promise<StatusReport> {
  const started = Date.now();
  logDevStatus(`Waiting for ${BASE_URL} (timeout ${READINESS_TIMEOUT_MS}ms)...`);

  while (Date.now() - started < READINESS_TIMEOUT_MS) {
    const report = await collectDevServerStatus({ startupMs: Date.now() - started });
    if (report.status === "READY") {
      logDevStatus(`READY — ${BASE_URL} (${report.startupMs}ms)`);
      for (const route of report.routes) {
        if (route.path === "/health") continue;
        logDevStatus(`${route.path} responded ${route.status ?? "timeout"} in ${route.ms ?? "?"}ms`);
      }
      return report;
    }
    if (report.status === "UNHEALTHY") {
      logDevStatus("UNHEALTHY — port open but routes failing");
      return report;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const report = await collectDevServerStatus({ startupMs: Date.now() - started });
  report.status = report.portListening ? "UNHEALTHY" : "STARTING";
  report.message = report.portListening
    ? "Timed out waiting for healthy routes."
    : "Timed out waiting for port to listen.";
  logDevStatus(`${report.status} — ${report.message}`);
  return report;
}

export async function checkPortConflict(): Promise<StatusReport> {
  const { listening, pid } = await probePort(DEV_PORT);
  return {
    status: listening ? "PORT_CONFLICT" : "STARTING",
    port: DEV_PORT,
    baseUrl: BASE_URL,
    portListening: listening,
    portConflict: listening,
    portOwnerPid: pid,
    startupMs: null,
    routes: [],
    message: listening
      ? `Port ${DEV_PORT} is in use${pid ? ` (pid ${pid})` : ""}.`
      : `Port ${DEV_PORT} is free.`,
    timestamp: new Date().toISOString(),
  };
}

export function printStatusReport(report: StatusReport) {
  if (report.status === "READY") {
    logDevStatus(`READY — ${report.baseUrl}`);
    for (const route of report.routes) {
      if (route.path === "/health") continue;
      logDevStatus(`${route.path} responded ${route.status ?? "timeout"} in ${route.ms ?? "?"}ms`);
    }
  } else {
    logDevStatus(`${report.status} — ${report.message}`);
  }
  console.log(JSON.stringify(report, null, 2));
}
