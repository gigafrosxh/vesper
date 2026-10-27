import { EventBus } from '../core/events';
import { angleDiff, dist3, distXZ, Rng, v3, type Vec3 } from '../core/math';
import { EMPTY_FRAME, type InputFrame } from '../input/inputRouter';
import { StoryLedger, type LedgerData } from '../time/ledger';
import { TemporalService, TICK_RATE, type TemporalStatus, type TemporalTarget } from '../time/temporal';
import type { SimContext, SimOptions } from './context';
import { DialogueRunner, type DialogueGraph } from './dialogue';
import { Enemy, ES, type Hazard, type HazardSink } from './enemies';
import { CollisionWorld } from './physics';
import { Player } from './player';
import { Prop } from './props';
import { QuestLog, type QuestDef, type QuestLogData } from './quests';
import { Sequencer, type SeqGen } from './sequencer';
import { Mira } from './mira';

export const DT = 1 / TICK_RATE;

export interface Interactable {
  id: string;
  pos: Vec3;
  radius: number;
  prompt: string; // verb key, e.g. 'prompt.inspect'
  label: string; // object name key
  enabled?: () => boolean;
  onInteract: () => void;
  /** Visual marker kind for the view layer. */
  marker?: 'evidence' | 'item' | 'npc' | 'lever' | 'door' | 'device';
}

export interface Trigger {
  id: string;
  min: Vec3;
  max: Vec3;
  once?: boolean;
  when?: () => boolean;
  onEnter: () => void;
  inside?: boolean;
}

export interface Area {
  id: string; // string key for name
  region: string;
  min: Vec3;
  max: Vec3;
}

export interface Landmark {
  id: string;
  name: string;
  pos: Vec3;
  radius: number;
}

export interface Checkpoint {
  id: string;
  pos: Vec3;
  yaw: number;
}

export interface SavePayload {
  player: { health: number; maxHealth: number };
  checkpoint: Checkpoint;
  temporal: { energy: number; rewind: boolean; anchor: boolean };
  ledger: LedgerData;
  quests: { entries: QuestLogData; order: string[] };
  props: Record<string, number[]>;
  mira: { visible: boolean };
  playTime: number;
}

export function isSavePayload(p: unknown): p is SavePayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, any>;
  const isVec = (v: any) => v && [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n));
  return (
    typeof o.player?.health === 'number' &&
    typeof o.player?.maxHealth === 'number' &&
    typeof o.checkpoint?.id === 'string' &&
    isVec(o.checkpoint?.pos) &&
    typeof o.checkpoint?.yaw === 'number' &&
    typeof o.temporal?.energy === 'number' &&
    typeof o.ledger?.facts === 'object' &&
    Array.isArray(o.ledger?.irreversible) &&
    Array.isArray(o.ledger?.claimed) &&
    Array.isArray(o.ledger?.evidence) &&
    typeof o.quests?.entries === 'object' &&
    Array.isArray(o.quests?.order) &&
    typeof o.props === 'object' &&
    typeof o.playTime === 'number'
  );
}

/** Builds the level and its scripting into a Sim (content layer). */
export type ContentBuilder = (sim: Sim) => void;

export interface TargetInfo {
  target: TemporalTarget;
  status: TemporalStatus;
  distance: number;
}

export interface SimInit {
  content: ContentBuilder;
  quests: Record<string, QuestDef>;
  dialogues: Record<string, DialogueGraph<Sim>>;
  save?: SavePayload;
  options?: Partial<SimOptions> & { hintMode?: 'off' | 'manual' | 'escalating' };
  seed?: number;
  bus?: EventBus;
  start: Checkpoint;
}

export class Sim implements HazardSink {
  readonly bus: EventBus;
  readonly world = new CollisionWorld();
  readonly temporal: TemporalService;
  ledger: StoryLedger;
  readonly player: Player;
  readonly rng: Rng;
  readonly quests: QuestLog;
  readonly dialogue: DialogueRunner<Sim>;
  readonly dialogues: Record<string, DialogueGraph<Sim>>;
  readonly seq = new Sequencer();
  readonly mira = new Mira();
  readonly ctx: SimContext;
  options: SimOptions & { hintMode: 'off' | 'manual' | 'escalating' };

  props = new Map<string, Prop>();
  enemies = new Map<string, Enemy>();
  hazards: Hazard[] = [];
  private hazardId = 0;
  interactables = new Map<string, Interactable>();
  triggers: Trigger[] = [];
  areas: Area[] = [];
  landmarks: Landmark[] = [];
  checkpoint: Checkpoint;

  tick = 0;
  time = 0;
  playTime = 0;
  area = '';
  region = 'clockfall';
  focusInteract: Interactable | null = null;
  target: TargetInfo | null = null;
  cameraOverride: { pos: Vec3; look: Vec3 } | null = null;
  deathTimer = 0;
  respawnRequested = false;
  completed = false;
  /** Visual-only state for the view: roof hiding, fog tint, sky eye, etc. */
  visual: Record<string, number> = {};
  timeScale = 1;
  /** Calls from the presentation layer into content scripts (e.g. the dial lock). */
  hooks: { dial?: (code: number[]) => boolean } = {};

  constructor(init: SimInit) {
    this.bus = init.bus ?? new EventBus();
    this.rng = new Rng(init.seed ?? 1337);
    this.options = { aimAssist: 'low', rewindWindow: 6, hintMode: 'manual', ...init.options };
    this.temporal = new TemporalService(this.bus);
    this.temporal.setWindow(this.options.rewindWindow);
    this.ledger = init.save ? StoryLedger.from(init.save.ledger) : new StoryLedger();
    this.checkpoint = init.save ? { ...init.save.checkpoint, pos: { ...init.save.checkpoint.pos } } : { ...init.start, pos: { ...init.start.pos } };
    this.player = new Player(this.checkpoint.pos, this.checkpoint.yaw);
    this.quests = new QuestLog(init.quests);
    this.dialogues = init.dialogues;
    this.ctx = {
      bus: this.bus,
      world: this.world,
      temporal: this.temporal,
      ledger: this.ledger,
      player: this.player,
      rng: this.rng,
      tick: 0,
      time: 0,
      options: this.options,
    };
    this.dialogue = new DialogueRunner<Sim>(
      this.ledger,
      this,
      (id) => {
        this.player.locked = this.seq.cinematicActive;
        this.bus.emit('dialogue.ended', { dialogueId: id });
      },
      (line) => this.bus.emit('dialogue.line', { speaker: line.speaker, textKey: line.text }),
    );

    if (init.save) {
      const s = init.save;
      this.player.health = s.player.health;
      this.player.maxHealth = s.player.maxHealth;
      this.temporal.energy = s.temporal.energy;
      this.temporal.enabled.rewind = s.temporal.rewind;
      this.temporal.enabled.anchor = s.temporal.anchor;
      this.quests.load(s.quests);
      this.mira.visible = s.mira.visible;
      this.playTime = s.playTime;
    }
    // Every defeat (by combat or by falling) is a permanent fact, registered before content listeners run.
    this.bus.on('enemy.defeated', ({ id }) => this.ledger.commit(`dead.${id}`));
    init.content(this);
    if (init.save) {
      for (const [id, state] of Object.entries(init.save.props)) {
        const p = this.props.get(id);
        if (p && Array.isArray(state)) {
          p.load(state);
          p.syncColliders(this.world);
          // Rebuild history deterministically from the restored state so a reload never strands a puzzle.
          this.temporal.unregister(id);
          this.temporal.register(p);
          const track = this.temporal.track(id)!;
          const hist = p.synthesizeHistory();
          if (hist.length > 1) {
            track.clear();
            hist.forEach((st, i) => track.record(i - hist.length, st));
          }
        }
      }
    }
    this.mira.snapTo(this.player);
    this.updateArea(true);
  }

  // ---------------------------------------------------------------- content API

  addProp<T extends Prop>(prop: T): T {
    this.props.set(prop.id, prop);
    (prop as unknown as { attach?: (w: CollisionWorld) => void }).attach?.(this.world);
    if (prop.rewindable || prop.anchorable) this.temporal.register(prop);
    return prop;
  }

  addEnemy<T extends Enemy>(enemy: T): T {
    if (this.ledger.has(`dead.${enemy.id}`)) return enemy;
    this.enemies.set(enemy.id, enemy);
    this.temporal.register(enemy);
    return enemy;
  }

  removeEnemy(id: string): void {
    this.enemies.delete(id);
    this.temporal.unregister(id);
    if (this.player.lockTargetId === id) this.player.lockTargetId = null;
  }

  addInteractable(i: Interactable): void {
    this.interactables.set(i.id, i);
  }

  addTrigger(t: Trigger): void {
    this.triggers.push(t);
  }

  spawn(h: Omit<Hazard, 'id' | 't' | 'hit'>): void {
    this.hazards.push({ ...h, id: ++this.hazardId, t: 0, hit: false });
  }

  say(speaker: string, text: string, params?: Record<string, string>): void {
    const len = text.length;
    this.bus.emit('subtitle', { speaker, textKey: text, duration: Math.max(2.6, 1.6 + len * 0.012), params });
  }

  startDialogue(id: string): void {
    const g = this.dialogues[id];
    if (!g || this.dialogue.active) return;
    this.player.locked = true;
    this.player.lockTargetId = null;
    this.temporal.cancelPreview();
    this.bus.emit('dialogue.started', { dialogueId: id });
    this.dialogue.start(g);
  }

  run(id: string, gen: SeqGen, opts: { cinematic?: boolean; skippable?: boolean } = {}): void {
    if (opts.cinematic) {
      this.player.locked = true;
      this.temporal.cancelPreview();
    }
    this.seq.start(id, gen, opts);
  }

  setStage(questId: string, stage: string): void {
    if (this.quests.setStage(questId, stage, this.playTime)) {
      this.bus.emit('quest.stage', { questId, stage });
      this.bus.emit('journal.updated', { reason: 'objective' });
    }
  }

  completeQuest(questId: string): void {
    if (this.quests.complete(questId)) {
      this.bus.emit('quest.completed', { questId });
      this.bus.emit('journal.updated', { reason: 'quest' });
    }
  }

  addEvidence(id: string): void {
    if (this.ledger.addEvidence(id)) {
      this.bus.emit('evidence.found', { id });
      this.bus.emit('journal.updated', { reason: 'evidence' });
      this.bus.emit('sound', { id: 'evidence' });
    }
  }

  unlockAbility(id: 'rewind' | 'anchor'): void {
    if (this.temporal.enabled[id]) return;
    this.temporal.enabled[id] = true;
    this.ledger.commit(`ability.${id}`);
    this.bus.emit('ability.unlocked', { id });
  }

  setCheckpoint(id: string, pos: Vec3, yaw: number): void {
    this.checkpoint = { id, pos: { ...pos }, yaw };
    this.bus.emit('checkpoint.reached', { checkpointId: id });
  }

  teleport(pos: Vec3, yaw: number): void {
    this.player.pos = { ...pos };
    this.player.vel = v3();
    this.player.yaw = yaw;
    this.player.camYaw = yaw;
    this.player.onGround = true;
    this.mira.snapTo(this.player);
  }

  completeGame(): void {
    this.completed = true;
    this.bus.emit('game.completed', {});
  }

  /** Requests the next hint tier for the tracked objective (never solves anything by itself). */
  requestHint(): number {
    const tr = this.quests.tracked();
    if (!tr) return 0;
    if (tr.entry.hintTier < 3) tr.entry.hintTier++;
    this.bus.emit('hint.shown', { objectiveId: `${tr.quest.id}/${tr.entry.stage}`, tier: tr.entry.hintTier });
    return tr.entry.hintTier;
  }

  // ---------------------------------------------------------------- simulation

  private pickLockTarget(): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const p = this.player;
    for (const e of this.enemies.values()) {
      if (!e.alive) continue;
      const d = distXZ(e.pos, p.pos);
      if (d > 16) continue;
      const ang = Math.atan2(-(e.pos.x - p.pos.x), -(e.pos.z - p.pos.z));
      const off = Math.abs(angleDiff(p.camYaw, ang));
      const score = d + off * 6;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private assistTarget(): Enemy | null {
    const range = this.options.aimAssist === 'high' ? 5.5 : this.options.aimAssist === 'low' ? 3.5 : 0;
    if (range === 0) return null;
    let best: Enemy | null = null;
    let bd = range;
    for (const e of this.enemies.values()) {
      if (!e.alive) continue;
      const d = distXZ(e.pos, this.player.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Temporal targeting: eligible, blocked and unsafe objects are all reported (UX §3). */
  private pickTemporalTarget(): TargetInfo | null {
    const p = this.player;
    const head = v3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    const cone = this.options.aimAssist === 'high' ? 0.75 : this.options.aimAssist === 'low' ? 0.5 : 0.32;
    let best: TargetInfo | null = null;
    let bestScore = Infinity;
    // A locked enemy is always the preferred target.
    if (p.lockTargetId) {
      const e = this.enemies.get(p.lockTargetId);
      if (e) return { target: e, status: this.temporal.statusFor(e, p.pos), distance: dist3(e.getPosition(), head) };
    }
    for (const t of this.temporal.all()) {
      if (t instanceof Prop && !t.targetable()) continue;
      if (t instanceof Enemy && !this.enemies.has(t.id)) continue;
      const pos = t.getPosition();
      const d = dist3(pos, head);
      if (d > (t instanceof Prop ? t.targetRange : 22)) continue;
      const ang = Math.atan2(-(pos.x - p.pos.x), -(pos.z - p.pos.z));
      const off = Math.abs(angleDiff(p.camYaw, ang));
      const near = distXZ(pos, p.pos) < 2.5;
      if (off > cone && !near) continue;
      if (!(t instanceof Prop && t.ignoreLos) && !this.world.lineOfSight(head, pos, t.id)) continue;
      // Objects that actually have something to rewind win over idle ones; blocked targets are still reported.
      const status = this.temporal.statusFor(t, p.pos);
      const score = off * 12 + d * 0.25 + (status.kind === 'eligible' ? 0 : status.reason === 'no_history' ? 12 : 3);
      if (score < bestScore) {
        bestScore = score;
        best = { target: t, status, distance: d };
      }
    }
    return best;
  }

  private updateInteractFocus(): void {
    const p = this.player;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    if (!p.alive || p.locked || this.dialogue.active) {
      this.focusInteract = null;
      return;
    }
    const f = p.facingDir();
    for (const i of this.interactables.values()) {
      if (i.enabled && !i.enabled()) continue;
      const d = distXZ(i.pos, p.pos);
      if (d > i.radius || Math.abs(i.pos.y - (p.pos.y + 1)) > 2.6) continue;
      const dx = (i.pos.x - p.pos.x) / (d || 1);
      const dz = (i.pos.z - p.pos.z) / (d || 1);
      const facing = dx * f.x + dz * f.z;
      if (facing < -0.2 && d > 1.0) continue;
      const score = d - facing * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.focusInteract = best;
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (h.kind === 'eruption') {
        if (!h.hit && h.t >= h.delay) {
          h.hit = true;
          this.bus.emit('sound', { id: 'root_erupt', position: [h.pos.x, h.pos.y, h.pos.z] });
          if (distXZ(p.pos, h.pos) < h.radius && Math.abs(p.pos.y - h.pos.y) < 1.5) p.damage(this.ctx, h.damage, h.pos);
        }
      } else {
        h.radius += (h.speed ?? 8) * dt;
        const d = distXZ(p.pos, h.pos);
        if (!h.hit && Math.abs(d - h.radius) < 0.7 && p.pos.y - h.pos.y < 0.5) {
          h.hit = true;
          p.damage(this.ctx, h.damage, h.pos);
        }
      }
    }
    this.hazards = this.hazards.filter((h) => (h.kind === 'eruption' ? h.t < h.delay + 0.6 : h.radius < (h.maxRadius ?? 14)));
  }

  private updateCombat(): void {
    const atk = this.player.activeAttack();
    if (!atk) return;
    const p = this.player;
    for (const e of this.enemies.values()) {
      if (!e.alive || p.hitDone.has(e.id)) continue;
      const d = distXZ(e.pos, p.pos);
      if (d > atk.range + e.radius || Math.abs(e.pos.y - p.pos.y) > 2) continue;
      const ang = Math.atan2(-(e.pos.x - p.pos.x), -(e.pos.z - p.pos.z));
      if (Math.abs(angleDiff(p.yaw, ang)) > atk.arc && d > e.radius + 0.4) continue;
      p.hitDone.add(e.id);
      const dealt = e.takeDamage(this.ctx, atk.damage);
      this.bus.emit('combat.hit', { attacker: 'player', target: e.id });
      this.bus.emit('sound', { id: e.armor < 1 ? 'hit_armor' : 'hit', position: [e.pos.x, e.pos.y, e.pos.z], volume: dealt > 15 ? 1 : 0.7 });
      if (!e.alive && p.lockTargetId === e.id) p.lockTargetId = null;
    }
  }

  private updateTriggers(): void {
    const pos = this.player.pos;
    for (const t of this.triggers) {
      const inside = pos.x >= t.min.x && pos.x <= t.max.x && pos.y >= t.min.y && pos.y <= t.max.y && pos.z >= t.min.z && pos.z <= t.max.z;
      if (inside && !t.inside) {
        const doneKey = `trig.${t.id}`;
        if (!(t.once && this.ledger.has(doneKey)) && (!t.when || t.when())) {
          if (t.once) this.ledger.set(doneKey);
          t.onEnter();
        } else if (t.when && !t.when()) {
          // Condition not met yet: re-test next tick while inside.
          continue;
        }
      }
      t.inside = inside;
    }
  }

  updateArea(force = false): void {
    const pos = this.player.pos;
    const a = this.areas.find((r) => pos.x >= r.min.x && pos.x <= r.max.x && pos.z >= r.min.z && pos.z <= r.max.z && pos.y >= r.min.y && pos.y <= r.max.y);
    if (a && (a.id !== this.area || force)) {
      this.area = a.id;
      this.region = a.region;
      this.ledger.set('lastArea', a.id);
      this.bus.emit('region.entered', { regionId: a.id });
    }
    for (const l of this.landmarks) {
      if (distXZ(l.pos, pos) < l.radius && this.ledger.addLandmark(l.id)) this.bus.emit('landmark.discovered', { id: l.id });
    }
  }

  /** One fixed simulation tick (1/60 s). */
  step(frame: InputFrame = EMPTY_FRAME): void {
    this.tick++;
    this.bus.tick = this.tick;
    const dt = DT;
    this.time += dt;
    this.playTime += dt;
    this.ctx.tick = this.tick;
    this.ctx.time = this.time;
    this.ledger.clock = this.playTime;
    const p = this.player;
    const controlled = !p.locked && p.alive && !this.dialogue.active;
    const f = controlled ? frame : EMPTY_FRAME;

    // Lock-on (FR-008).
    if (f.pressed.has('lockOn')) {
      if (p.lockTargetId) p.lockTargetId = null;
      else p.lockTargetId = this.pickLockTarget()?.id ?? null;
      this.bus.emit('sound', { id: 'ui_lock' });
    }
    let lockEnemy = p.lockTargetId ? this.enemies.get(p.lockTargetId) : undefined;
    if (lockEnemy && (!lockEnemy.alive || distXZ(lockEnemy.pos, p.pos) > 22)) {
      p.lockTargetId = null;
      lockEnemy = undefined;
    }

    // Temporal targeting and rewind (UC-02).
    this.target = controlled ? this.pickTemporalTarget() : null;
    const t = this.temporal;
    if (t.preview) {
      const lost = !controlled || f.pressed.has('dodge') || !t.get(t.preview.targetId);
      if (lost) {
        t.cancelPreview();
        if (controlled) frame !== EMPTY_FRAME && this.bus.emit('sound', { id: 'rewind_cancel' });
      } else if (f.released.has('rewind') || !f.active.has('rewind')) t.commit(p.pos);
      else t.updatePreview(dt);
    } else if (f.pressed.has('rewind')) {
      t.beginPreview(this.target?.target.id ?? null, p.pos);
    }
    if (f.pressed.has('anchor')) t.setAnchor(this.target?.target.id ?? null);

    // While previewing, the world slows so the player can read the outcome (time-dilated preview).
    this.timeScale = t.preview ? 0.3 : 1;
    const wdt = dt * this.timeScale;

    if (f.pressed.has('hint') && this.options.hintMode !== 'off') this.requestHint();
    if (this.options.hintMode === 'escalating') {
      const tr = this.quests.tracked();
      if (tr && tr.entry.hintTier < 3 && this.playTime - tr.entry.startedAt > 150 * (tr.entry.hintTier + 1)) this.requestHint();
    }

    this.seq.update(dt);
    if (!this.seq.cinematicActive && !this.dialogue.active && p.locked) p.locked = false;

    let lockPos: Vec3 | null = lockEnemy ? lockEnemy.pos : null;
    if (!lockPos && f.pressed.has('attack')) lockPos = this.assistTarget()?.pos ?? null;
    p.updateCamera(f, dt, lockEnemy ? lockEnemy.pos : null);
    p.update(this.ctx, f, wdt, lockPos);
    this.mira.update(this, wdt);

    this.updateCombat();
    for (const prop of this.props.values()) prop.update(this.ctx, wdt);
    for (const e of this.enemies.values()) e.update(this.ctx, wdt, this);
    this.updateHazards(wdt);
    for (const prop of this.props.values()) prop.syncColliders(this.world);

    t.recordAll(this.tick);
    t.update(dt);

    if (controlled && f.pressed.has('interact') && this.focusInteract) {
      const i = this.focusInteract;
      this.bus.emit('interact.performed', { id: i.id });
      i.onInteract();
    }
    this.updateTriggers();
    this.updateInteractFocus();
    if (this.tick % 10 === 0) this.updateArea();

    if (!p.alive) {
      this.deathTimer += dt;
      if (this.deathTimer > 2.4) this.respawnRequested = true;
    }
  }

  // ---------------------------------------------------------------- persistence

  serialize(): SavePayload {
    const props: Record<string, number[]> = {};
    for (const [id, p] of this.props) props[id] = p.persist();
    return {
      player: { health: Math.max(this.player.health, this.player.maxHealth * 0.6), maxHealth: this.player.maxHealth },
      checkpoint: { ...this.checkpoint, pos: { ...this.checkpoint.pos } },
      temporal: this.temporal.serialize(),
      ledger: this.ledger.serialize(),
      quests: this.quests.serialize(),
      props,
      mira: { visible: this.mira.visible },
      playTime: this.playTime,
    };
  }

  /** Health restored for a checkpoint reload; everything else comes from the checkpoint. */
  static respawnPayload(save: SavePayload): SavePayload {
    const copy: SavePayload = structuredClone(save);
    copy.player.health = copy.player.maxHealth;
    copy.temporal.energy = Math.max(copy.temporal.energy, 2.5);
    return copy;
  }

  enemyStateName(e: Enemy): string {
    return ES[e.state];
  }
}
