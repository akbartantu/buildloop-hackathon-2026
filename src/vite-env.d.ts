/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV_AUTH_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
