export class ProtectedPathApprovalRequiredError extends Error {
  readonly path: string;

  constructor(path: string, message?: string) {
    super(message ?? `Protected path approval required before writing: ${path}`);
    this.name = "ProtectedPathApprovalRequiredError";
    this.path = path;
  }
}

export type ProtectedPathApprovalRecord = {
  paths: string[];
  actorUserId: string;
  createdAt: string;
  note?: string | null;
};

export function extractApprovedProtectedPaths(
  approvals: ProtectedPathApprovalRecord[] | undefined,
): string[] {
  if (!approvals?.length) {
    return [];
  }
  return approvals.flatMap((entry) => entry.paths);
}

export function resolvePatchProtectedPathDecision(input: {
  filePath: string;
  allowedPaths: string[];
  protectedAreas: string[];
  approvalRequiredPaths: string[];
  approvedProtectedPaths: string[];
}): "apply" | "requires_approval" | "forbidden" {
  const normalized = input.filePath.replace(/\\/g, "/");
  const isProtected = input.protectedAreas.some((pattern) => matchesPathPattern(normalized, pattern));
  const approvalRequired = input.approvalRequiredPaths.some((pattern) =>
    matchesPathPattern(normalized, pattern),
  );
  const allowed = input.allowedPaths.some((pattern) => matchesPathPattern(normalized, pattern));

  if (isProtected && approvalRequired) {
    const approved = input.approvedProtectedPaths.some((pattern) =>
      matchesPathPattern(normalized, pattern),
    );
    return approved ? "apply" : "requires_approval";
  }

  if (isProtected) {
    return "forbidden";
  }

  if (!allowed && !approvalRequired) {
    return "forbidden";
  }

  return "apply";
}

export function recordProtectedPathApproval(input: {
  runnerState: import("@/lib/task-contract").RunnerState;
  paths: string[];
  actorUserId: string;
  note?: string;
}): import("@/lib/task-contract").RunnerState {
  const now = new Date().toISOString();
  return {
    ...input.runnerState,
    protectedPathApprovals: [
      ...(input.runnerState.protectedPathApprovals ?? []),
      {
        paths: input.paths,
        actorUserId: input.actorUserId,
        createdAt: now,
        ...(input.note ? { note: input.note } : {}),
      },
    ],
  };
}

function matchesPathPattern(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    );
    return regex.test(normalized);
  }
  return normalized === pattern;
}
