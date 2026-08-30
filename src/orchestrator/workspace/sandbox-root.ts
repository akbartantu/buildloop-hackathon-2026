import os from "node:os";
import path from "node:path";

/** Writable root for ephemeral clones, worktrees, and run sandboxes. */
export function getSandboxRoot(workspaceRoot?: string): string {
  const configured = process.env["BUILDLOOP_SANDBOX_ROOT"]?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  if (process.env["NODE_ENV"] === "production") {
    return path.join(os.tmpdir(), "buildloop");
  }

  return path.join(workspaceRoot ?? process.cwd(), ".buildloop");
}
