import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getRuntimeSnapshot } from "@/lib/runtime.functions";

export function useRuntimeSnapshot() {
  const fetchSnapshot = useServerFn(getRuntimeSnapshot);

  return useQuery({
    queryKey: ["runtime-snapshot"],
    queryFn: () => fetchSnapshot(),
    staleTime: 60_000,
  });
}
