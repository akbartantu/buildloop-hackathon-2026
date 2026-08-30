import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CONNECTED_REPOSITORY_STORAGE_KEY,
  parseConnectedRepository,
  serializeConnectedRepository,
  type ConnectedRepositorySource,
} from "@/lib/repository/repository-source";
import { connectPublicRepository } from "@/lib/repository.functions";

export function useConnectedRepository() {
  const connectRepository = useServerFn(connectPublicRepository);
  const [source, setSource] = useState<ConnectedRepositorySource | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSource(parseConnectedRepository(window.localStorage.getItem(CONNECTED_REPOSITORY_STORAGE_KEY)));
    setIsHydrated(true);
  }, []);

  const persistSource = useCallback((next: ConnectedRepositorySource | null) => {
    setSource(next);
    if (typeof window === "undefined") {
      return;
    }

    if (next) {
      window.localStorage.setItem(CONNECTED_REPOSITORY_STORAGE_KEY, serializeConnectedRepository(next));
    } else {
      window.localStorage.removeItem(CONNECTED_REPOSITORY_STORAGE_KEY);
    }
  }, []);

  async function connect(url: string) {
    const result = await connectRepository({ data: { url } });
    if (result.status === "ok") {
      persistSource(result.source);
    }
    return result;
  }

  function disconnect() {
    persistSource(null);
  }

  return {
    source,
    isHydrated,
    connect,
    disconnect,
  };
}
