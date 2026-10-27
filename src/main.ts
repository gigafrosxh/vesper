import { App } from './app/app';
import { AudioEngine } from './audio/audio';
import { Ui } from './ui/ui';

// Entry point. `?play` starts a game immediately with in-memory saves (tests and quick checks);
// `?memory` keeps the normal flow but never touches persistent storage.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
let app: App;
try {
  app = new App(canvas, { memoryStorage: params.has('play') || params.has('memory') });
} catch (e) {
  // Without WebGL 2 the game cannot run; say so instead of showing a black window.
  showFatal(e);
  throw e;
}
const ui = new Ui(app, document.getElementById('ui')!);
app.ui = ui;
const audio = new AudioEngine();
app.audio = audio;
audio.applySettings(app.settings.get());
// Audio can only start after a user gesture.
for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchstart']) window.addEventListener(ev, () => audio.resume(), { passive: true });
window.addEventListener('gamepadconnected', () => audio.resume());
(window as unknown as { __vesper: App }).__vesper = app;
if (params.has('play')) app.newGame(1);
else {
  app.showBackdrop();
  ui.start();
}
app.start();

function showFatal(e: unknown): void {
  const de = /^de\b/i.test(navigator.language);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = de ? 'VESPER kann nicht starten' : 'VESPER cannot start';
  const p = document.createElement('p');
  p.textContent = de
    ? 'Die Grafikschnittstelle (WebGL 2) ist nicht verfügbar. Bitte aktualisiere den Grafiktreiber oder aktiviere die Hardwarebeschleunigung.'
    : 'The graphics interface (WebGL 2) is not available. Please update your graphics driver or enable hardware acceleration.';
  const d = document.createElement('pre');
  d.textContent = String(e instanceof Error ? e.message : e);
  box.append(h, p, d);
  document.getElementById('ui')!.append(box);
}
