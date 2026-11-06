import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const REPO = 'duo-blocks';

export default defineConfig(({ mode }) => ({
  base: mode === 'ghpages' || process.env.GITHUB_PAGES === 'true' ? `/${REPO}/` : '/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
