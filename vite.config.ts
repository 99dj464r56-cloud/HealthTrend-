import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  test: {
    environment: 'node',
    exclude: ['tests/**/*.spec.ts', '**/node_modules/**', '**/dist/**'],
    clearMocks: true,
  },
});
