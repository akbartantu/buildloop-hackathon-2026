import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const DEV_PORT = 8080;

function buildLoopDevStatusPlugin() {
  return {
    name: "buildloop-dev-status",
    configureServer(server: {
      httpServer?: { once: (event: string, cb: () => void) => void } | null;
    }) {
      console.log(`[BuildLoop] Starting dev server on http://localhost:${DEV_PORT} ...`);
      server.httpServer?.once("listening", () => {
        console.log(`[BuildLoop] Vite listening — http://localhost:${DEV_PORT}`);
        console.log(
          `[BuildLoop] Run "bun run dev:status" or "bun .buildloop/scripts/dev-server-status.ts wait" to verify routes.`,
        );
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const envDefine: Record<string, string> = {};
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  for (const key of new Set([
    ...Object.keys(fileEnv),
    ...Object.keys(process.env).filter((name) => name.startsWith("VITE_")),
  ])) {
    const value = process.env[key] ?? fileEnv[key] ?? "";
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins = [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
    buildLoopDevStatusPlugin(),
  ];

  if (command === "build") {
    plugins.splice(3, 0, nitro({ preset: "node-server" }));
  }

  return {
    define: {
      ...envDefine,
      "import.meta.env.DEV_AUTH_BYPASS": JSON.stringify(process.env["DEV_AUTH_BYPASS"] ?? ""),
    },
    css: { transformer: "lightningcss" as const },
    ssr: {
      external: ["@google/adk"],
      noExternal: [],
    },
    build: {
      rolldownOptions: {
        external: ["@google/adk"],
      },
    },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    plugins,
    server: {
      port: DEV_PORT,
      strictPort: true,
      host: true,
    },
  };
});
