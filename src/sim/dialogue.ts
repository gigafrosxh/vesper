import type { StoryLedger } from '../time/ledger';

// Dialogue graph (UC-04, FR-009). Choices keep stable positions: unavailable ones stay visible with an
// explanation instead of disappearing (UX §8). Player choices never auto-advance (UX §4).

export interface DialogueLine {
  speaker: string; // string key, e.g. 'speaker.mira'
  text: string; // string key
}

export interface DialogueChoice<Api> {
  text: string;
  next: string | null;
  condition?: (ledger: StoryLedger) => boolean;
  unavailableKey?: string;
  effect?: (api: Api) => void;
  /** Marks a choice whose result cannot be undone (shown with Warning Amber + label). */
  irreversible?: boolean;
  consequenceKey?: string;
  /** Tone tag used for journal wording. */
  tone?: string;
}

export interface DialogueNode<Api> {
  id: string;
  lines: DialogueLine[];
  choices?: DialogueChoice<Api>[];
  next?: string | null;
  effect?: (api: Api) => void;
}

export interface DialogueGraph<Api> {
  id: string;
  start: string | ((ledger: StoryLedger) => string);
  nodes: Record<string, DialogueNode<Api>>;
}

export interface ChoiceView {
  text: string;
  available: boolean;
  unavailableKey?: string;
  irreversible: boolean;
  consequenceKey?: string;
}

export type DialogueView =
  | { kind: 'line'; speaker: string; text: string; nodeId: string; lineIndex: number }
  | { kind: 'choice'; speaker: string; text: string; nodeId: string; choices: ChoiceView[] };

export class DialogueRunner<Api> {
  graph: DialogueGraph<Api> | null = null;
  node: DialogueNode<Api> | null = null;
  lineIndex = 0;

  constructor(
    private ledger: StoryLedger,
    private api: Api,
    private onEnd: (graphId: string) => void,
    private onLine: (line: DialogueLine) => void,
  ) {}

  get active(): boolean {
    return this.graph !== null;
  }

  start(graph: DialogueGraph<Api>): void {
    this.graph = graph;
    const start = typeof graph.start === 'function' ? graph.start(this.ledger) : graph.start;
    this.enter(start);
  }

  private enter(nodeId: string | null | undefined): void {
    if (!this.graph) return;
    if (!nodeId) return this.end();
    const node = this.graph.nodes[nodeId];
    if (!node) return this.end();
    this.node = node;
    this.lineIndex = 0;
    node.effect?.(this.api);
    if (node.lines.length > 0) this.onLine(node.lines[0]);
    else if (!node.choices) this.enter(node.next);
  }

  view(): DialogueView | null {
    const n = this.node;
    if (!this.graph || !n) return null;
    const line = n.lines[Math.min(this.lineIndex, n.lines.length - 1)] ?? { speaker: '', text: '' };
    const atLast = this.lineIndex >= n.lines.length - 1;
    if (atLast && n.choices) {
      return {
        kind: 'choice',
        speaker: line.speaker,
        text: line.text,
        nodeId: n.id,
        choices: n.choices.map((c) => {
          const available = c.condition ? c.condition(this.ledger) : true;
          return { text: c.text, available, unavailableKey: available ? undefined : c.unavailableKey, irreversible: !!c.irreversible, consequenceKey: c.consequenceKey };
        }),
      };
    }
    return { kind: 'line', speaker: line.speaker, text: line.text, nodeId: n.id, lineIndex: this.lineIndex };
  }

  /** Confirm on a line: next line or next node. Has no effect while a choice is pending. */
  advance(): void {
    const n = this.node;
    if (!n) return;
    if (this.lineIndex < n.lines.length - 1) {
      this.lineIndex++;
      this.onLine(n.lines[this.lineIndex]);
      return;
    }
    if (n.choices) return;
    this.enter(n.next);
  }

  choose(index: number): boolean {
    const n = this.node;
    if (!n?.choices) return false;
    if (this.lineIndex < n.lines.length - 1) return false;
    const c = n.choices[index];
    if (!c) return false;
    if (c.condition && !c.condition(this.ledger)) return false;
    c.effect?.(this.api);
    this.enter(c.next);
    return true;
  }

  end(): void {
    const id = this.graph?.id;
    this.graph = null;
    this.node = null;
    if (id) this.onEnd(id);
  }
}

/** Static validation (DialogueNode invariant "no missing terminal branch"). Returns problems found. */
export function validateGraph<Api>(g: DialogueGraph<Api>, startIds: string[] = []): string[] {
  const problems: string[] = [];
  const starts = typeof g.start === 'string' ? [g.start] : startIds;
  for (const s of starts) if (!g.nodes[s]) problems.push(`${g.id}: missing start ${s}`);
  for (const node of Object.values(g.nodes)) {
    if (node.lines.length === 0 && !node.choices && node.next === undefined) problems.push(`${g.id}/${node.id}: dead node`);
    const targets = node.choices ? node.choices.map((c) => c.next) : [node.next ?? null];
    for (const t of targets) if (t && !g.nodes[t]) problems.push(`${g.id}/${node.id}: dangling next ${t}`);
    if (node.choices && !node.choices.some((c) => !c.condition)) problems.push(`${g.id}/${node.id}: every choice is conditional (possible softlock)`);
  }
  // Every node must be able to reach an end (null next): grow the set of ending nodes to a fixed point.
  const targetsOf = (n: DialogueNode<Api>) => (n.choices ? n.choices.map((c) => c.next) : [n.next ?? null]);
  const canEnd = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of Object.values(g.nodes)) {
      if (canEnd.has(n.id)) continue;
      if (targetsOf(n).some((t) => t === null || canEnd.has(t))) {
        canEnd.add(n.id);
        grew = true;
      }
    }
  }
  for (const id of Object.keys(g.nodes)) if (!canEnd.has(id)) problems.push(`${g.id}/${id}: cannot reach an ending`);
  return problems;
}
