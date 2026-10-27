import { buildChapter, START } from '../content/chapter1';
import { DIALOGUES } from '../content/dialogues';
import { QUESTS } from '../content/quests';
import { EventBus, type EventMap, type EventName } from '../core/events';
import { setLanguage, setPseudoLocalization } from '../core/i18n';
import { EMPTY_FRAME, InputRouter, type InputFrame } from '../input/inputRouter';
import { SaveSystem, type LoadResult, type SlotInfo } from '../persistence/saveSystem';
import { createDefaultStorage, MemoryStorage, type StorageAdapter } from '../persistence/storage';
import { SettingsService, type Settings } from '../settings/settings';
import { DT, isSavePayload, Sim, type SavePayload } from '../sim/game';
import { GameView } from '../view/gameView';

// Application shell: owns the fixed-step loop, persistence and the wiring between layers.

export interface UiLayer {
  /** True while a menu or modal owns input; the simulation is paused. */
  readonly modal: boolean;
  /** Called once per rendered frame with the sampled input (UI navigation and HUD). */
  frame(input: InputFrame, dt: number): void;
  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void;
  onSimChanged(sim: Sim | null): void;
}

export interface AudioLayer {
  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void;
  update(sim: Sim | null, dt: number): void;
  applySettings(s: Settings): void;
  resume(): void;
}

export type AppState = 'menu' | 'game';

export class App {
  readonly storage: StorageAdapter;
  readonly settings: SettingsService;
  readonly saves: SaveSystem<SavePayload>;
  readonly input: InputRouter;
  readonly view: GameView;
  /** App-level bus for UI-facing notifications (save results, respawn). */
  readonly bus = new EventBus();
  ui: UiLayer | null = null;
  audio: AudioLayer | null = null;
  sim: Sim | null = null;
  state: AppState = 'menu';
  slot = 1;
  private lastCheckpoint: SavePayload | null = null;
  private pendingSave = false;
  private acc = 0;
  private last = 0;
  private renderAcc = 0;
  private unbind: (() => void) | null = null;
  private running = false;
  /** Non-simulated scene shown behind the main menu. */
  private backdrop: Sim | null = null;
  private backdropT = 0;
  /** Debug/test speed multiplier (e2e tests). */
  timeScale = 1;

  constructor(readonly canvas: HTMLCanvasElement, opts: { memoryStorage?: boolean } = {}) {
    this.storage = opts.memoryStorage ? new MemoryStorage() : createDefaultStorage();
    this.settings = new SettingsService(this.storage);
    this.saves = new SaveSystem<SavePayload>(this.storage, isSavePayload);
    const s = this.settings.get();
    this.input = new InputRouter(() => {
      const c = this.settings.get();
      return {
        bindings: c.input.bindings,
        holdMode: c.accessibility.holdMode,
        mouseSensitivity: c.camera.mouseSensitivity,
        stickSensitivity: c.camera.stickSensitivity,
        invertY: c.camera.invertY,
        deadzone: 0.2,
      };
    });
    this.input.attach(window);
    this.input.pointerLockTarget = canvas;
    this.view = new GameView(canvas, this.viewOptions(s));
    this.applySettings(s);
    this.settings.subscribe((n) => this.applySettings(n));
    window.addEventListener('resize', () => this.view.resize());
  }

  private viewOptions(s: Settings) {
    return { quality: s.graphics.quality, brightness: s.graphics.brightness, fov: s.camera.fov, shake: s.camera.shake, flashReduction: s.accessibility.flashReduction };
  }

  private applySettings(s: Settings): void {
    setLanguage(s.language);
    setPseudoLocalization(s.pseudoLocalization);
    this.view.applyOptions(this.viewOptions(s));
    if (this.sim) {
      this.sim.options.aimAssist = s.accessibility.aimAssist;
      this.sim.options.hintMode = s.accessibility.hintMode;
      this.sim.temporal.setWindow(s.gameplay.rewindWindow);
    }
    this.audio?.applySettings(s);
    document.documentElement.lang = s.language;
  }

  // ------------------------------------------------------------------ game lifecycle

  private createSim(save?: SavePayload): Sim {
    const s = this.settings.get();
    const bus = new EventBus();
    const sim = new Sim({
      content: buildChapter,
      quests: QUESTS,
      dialogues: DIALOGUES,
      start: START,
      save,
      bus,
      options: { aimAssist: s.accessibility.aimAssist, rewindWindow: s.gameplay.rewindWindow, hintMode: s.accessibility.hintMode },
    });
    return sim;
  }

  private enterGame(sim: Sim, checkpoint: SavePayload | null): void {
    this.unbind?.();
    this.sim = sim;
    this.lastCheckpoint = checkpoint;
    this.unbind = sim.bus.onAny((type, payload) => this.route(type, payload as never));
    this.view.attach(sim);
    this.ui?.onSimChanged(sim);
    this.state = 'game';
    this.input.gameplayFocus = true;
    this.acc = 0;
  }

  private route<K extends EventName>(type: K, payload: EventMap[K]): void {
    if (type === 'checkpoint.reached') this.pendingSave = true;
    this.view.onEvent(type, payload);
    this.ui?.onEvent(type, payload);
    this.audio?.onEvent(type, payload);
  }

  newGame(slot: number): void {
    this.slot = slot;
    const sim = this.createSim();
    this.enterGame(sim, null);
  }

  /** Loads a slot (falls back to the backup copy; corrupt saves never crash the game, NFR-02). */
  loadSlot(slot: number): LoadResult<SavePayload> {
    const res = this.saves.load(slot);
    if (!res.envelope) return res;
    if (res.status === 'recovered') this.saves.repair(slot);
    this.slot = slot;
    const payload = res.envelope.payload;
    try {
      const sim = this.createSim(Sim.respawnPayload(payload));
      this.enterGame(sim, payload);
    } catch (e) {
      return { envelope: null, status: 'corrupt', error: String(e) };
    }
    if (res.status === 'recovered') {
      // Emitted after the HUD is attached so the warning toast is visible (NFR-02).
      const ev = { slot, from: 'backup' as const };
      this.bus.emit('save.recovered', ev);
      this.ui?.onEvent('save.recovered', ev);
    }
    return res;
  }

  continueGame(): boolean {
    const latest = this.saves.latest();
    if (!latest) return false;
    return !!this.loadSlot(latest.slot).envelope;
  }

  slots(): SlotInfo[] {
    return this.saves.list();
  }

  /** Restarts from the last checkpoint (death or menu "Restart from checkpoint"). */
  respawn(): void {
    const cp = this.lastCheckpoint ?? (this.sim ? this.sim.serialize() : null);
    if (!cp) return;
    const sim = this.createSim(Sim.respawnPayload(cp));
    this.enterGame(sim, cp);
    this.bus.emit('player.respawned', { checkpointId: cp.checkpoint.id });
    this.ui?.onEvent('player.respawned', { checkpointId: cp.checkpoint.id });
  }

  quitToMenu(): void {
    this.unbind?.();
    this.unbind = null;
    this.sim = null;
    this.state = 'menu';
    this.input.gameplayFocus = false;
    this.input.releaseAll();
    this.showBackdrop();
    this.ui?.onSimChanged(null);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** The village under the shattered sky, seen from the south road (never simulated). */
  showBackdrop(): void {
    this.backdrop ??= this.createSim();
    this.backdrop.mira.visible = false;
    this.view.attach(this.backdrop);
  }

  private updateBackdrop(dt: number): void {
    const b = this.backdrop;
    if (!b) return;
    this.backdropT += dt;
    const a = Math.sin(this.backdropT * 0.05) * 0.35;
    b.cameraOverride = { pos: { x: Math.sin(a) * 22, y: 7 + Math.sin(this.backdropT * 0.07), z: 30 + Math.cos(a) * 30 }, look: { x: 0, y: 17, z: 30 } };
  }

  private writeCheckpoint(): void {
    const sim = this.sim;
    if (!sim) return;
    const payload = sim.serialize();
    this.lastCheckpoint = payload;
    const res = this.saves.save(this.slot, payload, { timestamp: Date.now(), region: sim.area || sim.region, checkpointId: sim.checkpoint.id, playTime: Math.round(sim.playTime) });
    const ev = { slot: this.slot, ok: res.ok, error: res.ok ? undefined : res.error };
    this.bus.emit('save.completed', ev);
    this.ui?.onEvent('save.completed', ev);
  }

  // ------------------------------------------------------------------ main loop

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const cap = this.settings.get().graphics.fpsCap;
    this.renderAcc += real;
    if (cap === 30 && this.renderAcc < 1 / 31) return;
    const dt = this.renderAcc;
    this.renderAcc = 0;
    this.frame(dt);
  };

  /** One rendered frame: input → UI → fixed simulation steps → render. Public for deterministic tests. */
  frame(dt: number): void {
    const input = this.input.sample(dt);
    this.ui?.frame(input, dt);
    const sim = this.sim;
    if (sim && this.state === 'game' && !this.ui?.modal) {
      this.acc += dt * this.timeScale;
      let first = true;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        // Edges and look deltas apply to the first step only so a press is never seen twice.
        sim.step(first ? input : { ...input, pressed: EMPTY_FRAME.pressed, released: EMPTY_FRAME.released, lookX: 0, lookY: 0 });
        this.view.capture();
        first = false;
        steps++;
        this.acc -= DT;
        if (this.pendingSave) {
          this.pendingSave = false;
          this.writeCheckpoint();
        }
      }
      if (steps === 12) this.acc = 0;
      if (sim.respawnRequested) this.respawn();
    }
    this.audio?.update(this.sim, dt);
    if (this.sim) this.view.render(dt, this.ui?.modal ? 1 : Math.min(1, this.acc / DT));
    else if (this.backdrop) {
      this.updateBackdrop(dt);
      this.view.render(dt, 1);
    }
  }
}
