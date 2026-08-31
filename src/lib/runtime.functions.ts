import { createServerFn } from "@tanstack/react-start";

import { buildRuntimeSnapshot } from "@/lib/runtime/runtime-status";

export const getRuntimeSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  return buildRuntimeSnapshot();
});
