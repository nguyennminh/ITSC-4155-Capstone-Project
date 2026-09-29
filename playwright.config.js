import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDirectory = mkdtempSync(join(tmpdir(), 'jobswipe-browser-'));
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: [
    { command: 'node server/index.js', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: false,
      env: { DB_PATH: join(dataDirectory, 'test.sqlite'), GEMINI_API_KEY: '' } },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
