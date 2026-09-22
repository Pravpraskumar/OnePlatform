/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_BASE: string;
  readonly VITE_CREDITGUARD_API_BASE: string;
  readonly VITE_B2C_TENANT_NAME: string;
  readonly VITE_B2C_POLICY_SIGNUP_SIGNIN: string;
  readonly VITE_B2C_CLIENT_ID: string;
  readonly VITE_B2C_API_SCOPE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
