import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/** Temporary backup dir for e2e — never the real iCloud folder. */
export const E2E_BACKUP_DIR = resolve('tmp/e2e-backup-dir');

const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:4173${basePath}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    env: { VITE_DISABLE_PERSONAL_SEED: '1', HEALTH_BACKUP_DIR: E2E_BACKUP_DIR },
    url: `http://127.0.0.1:4173${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
