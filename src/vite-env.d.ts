/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLAZE_PRESENTATION_URL?: string;
  readonly VITE_BLAZE_SOURCE_URL?: string;
  readonly VITE_BLAZE_EMBER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
