import { defineConfig } from 'vitest/config';
import { healthBackupPlugin } from './server/backupMiddleware.ts';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [healthBackupPlugin()],
  test: {
    environment: 'node',
    exclude: ['**/.worktrees/**', 'tests/**/*.spec.ts', 'tmp/**', '**/node_modules/**', '**/dist/**'],
    clearMocks: true,
  },
});
