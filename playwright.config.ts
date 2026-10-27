import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// End-to-end tests run against the production build (vite preview).
// In environments with a pre-installed Chromium, VESPER_CHROMIUM points at it.
const executablePath = process.env.VESPER_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 1280, height: 720 },
    launchOptions: { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
