// Event bus with a bounded event log (NFR-05: subsystem boundaries and event logs permit test isolation).
// The presentation layer only observes gameplay through these events, never through mutable physics state.

export type RewindFailure =
  | 'no_target'
  | 'insufficient_energy'
  | 'not_rewindable'
  | 'anchor_conflict'
  | 'corrupt_snapshot'
  | 'unsafe'
  | 'locked'
  | 'no_history'
  | 'anchored_death';

export interface EventMap {
  'rewind.preview': { targetId: string; seconds: number; cost: number };
  'rewind.commit': { targetId: string; seconds: number; cost: number };
  'rewind.cancel': { targetId: string };
  'rewind.failed': { reason: RewindFailure; targetId?: string };
  'anchor.set': { targetId: string; duration: number };
  'anchor.released': { targetId: string };
  'anchor.failed': { reason: RewindFailure; targetId?: string };
  'player.damaged': { amount: number; health: number };
  'player.died': { cause: string };
  'player.respawned': { checkpointId: string };
  'enemy.damaged': { id: string; amount: number; health: number };
  'enemy.defeated': { id: string; kind: string };
  'enemy.staggered': { id: string };
  'combat.hit': { attacker: string; target: string };
  'quest.stage': { questId: string; stage: string };
  'quest.completed': { questId: string };
  'journal.updated': { reason: string };
  'evidence.found': { id: string };
  'item.collected': { id: string };
  'ability.unlocked': { id: string };
  'flag.set': { flag: string; value: boolean | number | string };
  'dialogue.started': { dialogueId: string };
  'dialogue.line': { speaker: string; textKey: string };
  'dialogue.ended': { dialogueId: string };
  'subtitle': { speaker: string; textKey: string; duration: number; params?: Record<string, string> };
  'checkpoint.reached': { checkpointId: string };
  'save.completed': { slot: number; ok: boolean; error?: string };
  'save.recovered': { slot: number; from: 'backup' };
  'interact.performed': { id: string };
  'sound': { id: string; position?: [number, number, number]; volume?: number };
  'cinematic': { id: string };
  'camera.shake': { strength: number; duration: number };
  'flash': { color: string; strength: number };
  'region.entered': { regionId: string };
  'landmark.discovered': { id: string };
  'hint.shown': { objectiveId: string; tier: number };
  'game.completed': Record<string, never>;
  'title.card': { textKey: string; subKey?: string };
  'document': { titleKey: string; bodyKey: string };
  'tutorial': { key: string };
  'fade': { dir: 'out' | 'in'; duration: number };
  'ui.dial': Record<string, never>;
}

export type EventName = keyof EventMap;
type Handler<K extends EventName> = (payload: EventMap[K]) => void;

export interface LoggedEvent {
  tick: number;
  type: EventName;
  payload: unknown;
}

export class EventBus {
  private handlers = new Map<EventName, Set<Handler<any>>>();
  private anyHandlers = new Set<(type: EventName, payload: unknown) => void>();
  private log: LoggedEvent[] = [];
  private logLimit: number;
  tick = 0;

  constructor(logLimit = 2000) {
    this.logLimit = logLimit;
  }

  on<K extends EventName>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Observe every event (used to relay a simulation's events to the presentation layer). */
  onAny(handler: (type: EventName, payload: unknown) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends EventName>(type: K, payload: EventMap[K]): void {
    this.log.push({ tick: this.tick, type, payload });
    if (this.log.length > this.logLimit) this.log.splice(0, this.log.length - this.logLimit);
    const set = this.handlers.get(type);
    if (set) for (const h of [...set]) h(payload);
    for (const h of [...this.anyHandlers]) h(type, payload);
  }

  getLog(filter?: EventName): readonly LoggedEvent[] {
    return filter ? this.log.filter((e) => e.type === filter) : this.log;
  }

  clearLog(): void {
    this.log = [];
  }
}
