import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@platform/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      },
    },
    server: {
      host: env.VITE_HOST || env.VITE_DEV_HOST || 'localhost',
      port: Number(env.VITE_PORT || env.VITE_DEV_PORT || 5173),
      proxy: {
        '/api': env.VITE_CORE_API_URL || 'http://localhost:4000',
        '/creditguard-api': {
          target: env.VITE_CREDITGUARD_API_URL || 'http://localhost:4101',
          rewrite: (path) => path.replace(/^\/creditguard-api/, '/api'),
        },
      },
    },
    preview: {
      host: env.VITE_HOST || env.VITE_DEV_HOST || 'localhost',
      port: Number(env.VITE_PORT || env.VITE_DEV_PORT || 4173),
    },
  };
});
