// Desktop smoke test: launches the packaged-layout app with Electron and checks the native bridge.
// Run with: npm run build && xvfb-run -a node tests/desktop/electron.smoke.cjs
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vesper-e2e-'));
  // Software GL so the smoke test also runs on machines without a GPU.
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`, '--use-gl=angle', '--use-angle=swiftshader'], cwd: path.join(__dirname, '..', '..') });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.waitForSelector('[data-testid="screen-splash"]', { timeout: 60_000 });
  const title = await page.title();
  const result = await page.evaluate(() => {
    const n = window.vesperNative;
    n.writeSync('probe', '{"x":1}');
    const back = n.readSync('probe');
    let rejected = false;
    try {
      n.writeSync('../escape', 'x');
    } catch {
      rejected = true;
    }
    const keys = n.keysSync();
    n.removeSync('probe');
    return { back, rejected, keys, native: typeof window.__vesper.storage.bridge === 'object' };
  });
  const savesDir = path.join(userData, 'saves');
  const leftovers = fs.readdirSync(savesDir).filter((f) => f.endsWith('.tmp'));
  await app.close();
  const checks = {
    title: /VESPER/.test(title),
    roundTrip: result.back === '{"x":1}',
    pathTraversalRejected: result.rejected,
    keysListed: result.keys.includes('probe'),
    nativeAdapter: result.native === true,
    noTempFiles: leftovers.length === 0,
    noPageErrors: errors.length === 0,
  };
  console.log(JSON.stringify({ checks, errors }, null, 2));
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
