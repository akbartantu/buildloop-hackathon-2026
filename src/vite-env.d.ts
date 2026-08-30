/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV_AUTH_BYPASS?: string;
  readonly VITE_APP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
