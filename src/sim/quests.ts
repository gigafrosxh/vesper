import type { Vec3 } from '../core/math';
import type { StoryLedger } from '../time/ledger';

// Quest state (data model: QuestState questId, stage, flags) feeding the journal (FR-010).

export interface StageDef {
  /** Objective text key; may depend on dialogue tone flags (journal wording). */
  objective: string | ((ledger: StoryLedger) => string);
  /** Optional longer journal description. */
  detail?: string | ((ledger: StoryLedger) => string);
  /** Parameters for the objective text, e.g. collected counts. */
  params?: (ledger: StoryLedger) => Record<string, string | number>;
  location?: Vec3;
  /** Three escalating hint keys: direction -> mechanic -> place (FR-016). */
  hints: [string, string, string];
}

export interface QuestDef {
  id: string;
  title: string;
  main: boolean;
  stages: Record<string, StageDef>;
}

export interface QuestEntry {
  stage: string;
  completed: boolean;
  startedAt: number; // play time seconds when stage began (for escalating hints)
  hintTier: number; // hints already revealed for this stage (0..3)
}

export type QuestLogData = Record<string, QuestEntry>;

export class QuestLog {
  entries = new Map<string, QuestEntry>();
  order: string[] = [];

  constructor(private defs: Record<string, QuestDef>) {}

  def(id: string): QuestDef | undefined {
    return this.defs[id];
  }

  setStage(questId: string, stage: string, now: number): boolean {
    const def = this.defs[questId];
    if (!def || !def.stages[stage]) throw new Error(`unknown quest stage ${questId}/${stage}`);
    const cur = this.entries.get(questId);
    if (cur?.completed) return false;
    if (cur?.stage === stage) return false;
    this.entries.set(questId, { stage, completed: false, startedAt: now, hintTier: 0 });
    if (!this.order.includes(questId)) this.order.push(questId);
    return true;
  }

  complete(questId: string): boolean {
    const cur = this.entries.get(questId);
    if (!cur || cur.completed) return false;
    cur.completed = true;
    return true;
  }

  stage(questId: string): string | null {
    return this.entries.get(questId)?.stage ?? null;
  }

  isActive(questId: string, stage?: string): boolean {
    const e = this.entries.get(questId);
    if (!e || e.completed) return false;
    return stage ? e.stage === stage : true;
  }

  isCompleted(questId: string): boolean {
    return this.entries.get(questId)?.completed ?? false;
  }

  /** The tracked objective: newest active main quest, else newest active side quest. */
  tracked(): { quest: QuestDef; entry: QuestEntry; stage: StageDef } | null {
    const active = this.order.filter((id) => this.isActive(id));
    const main = active.filter((id) => this.defs[id].main);
    const id = (main.length ? main : active).at(-1);
    if (!id) return null;
    const quest = this.defs[id];
    const entry = this.entries.get(id)!;
    return { quest, entry, stage: quest.stages[entry.stage] };
  }

  completedQuests(): QuestDef[] {
    return this.order.filter((id) => this.isCompleted(id)).map((id) => this.defs[id]);
  }

  activeQuests(): QuestDef[] {
    return this.order.filter((id) => this.isActive(id)).map((id) => this.defs[id]);
  }

  serialize(): { entries: QuestLogData; order: string[] } {
    return { entries: Object.fromEntries([...this.entries].map(([k, v]) => [k, { ...v }])), order: [...this.order] };
  }

  load(data: { entries: QuestLogData; order: string[] }): void {
    this.entries.clear();
    for (const [k, v] of Object.entries(data.entries)) if (this.defs[k]?.stages[v.stage]) this.entries.set(k, { ...v });
    this.order = data.order.filter((id) => this.entries.has(id));
  }
}

export function resolveText(v: string | ((l: StoryLedger) => string) | undefined, ledger: StoryLedger): string | undefined {
  return typeof v === 'function' ? v(ledger) : v;
}
