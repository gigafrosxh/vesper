// Immutable story event ledger (SRS §5, §7): rewards, consumables and irreversible narrative facts.
// Nothing here is captured by snapshots, so rewind can never duplicate or erase them (FR-004).

export type FactValue = boolean | number | string;

export interface LedgerData {
  facts: Record<string, FactValue>;
  irreversible: string[];
  inventory: Record<string, number>;
  claimed: string[];
  evidence: string[];
  landmarks: string[];
  log: Array<{ t: number; fact: string }>;
}

export class StoryLedger {
  private facts = new Map<string, FactValue>();
  private irreversible = new Set<string>();
  private inventory = new Map<string, number>();
  private claimed = new Set<string>();
  readonly evidence: string[] = [];
  readonly landmarks: string[] = [];
  private log: Array<{ t: number; fact: string }> = [];
  clock = 0;

  /** Local flag; may change later (e.g. dialogue tone). */
  set(fact: string, value: FactValue = true): boolean {
    if (this.irreversible.has(fact)) return false;
    this.facts.set(fact, value);
    this.log.push({ t: this.clock, fact });
    return true;
  }

  /** Irreversible fact: written once, never overwritten by anything including rewind or dialogue. */
  commit(fact: string, value: FactValue = true): boolean {
    if (this.irreversible.has(fact)) return false;
    this.facts.set(fact, value);
    this.irreversible.add(fact);
    this.log.push({ t: this.clock, fact: `!${fact}` });
    return true;
  }

  isIrreversible(fact: string): boolean {
    return this.irreversible.has(fact);
  }

  get(fact: string): FactValue | undefined {
    return this.facts.get(fact);
  }

  has(fact: string): boolean {
    const v = this.facts.get(fact);
    return v !== undefined && v !== false && v !== 0 && v !== '';
  }

  num(fact: string): number {
    const v = this.facts.get(fact);
    return typeof v === 'number' ? v : 0;
  }

  /**
   * Grants a reward exactly once per claim id. Returns false if already claimed,
   * which is how a rewound chest or a re-triggered pickup cannot pay out twice.
   */
  claim(claimId: string, item?: string, amount = 1): boolean {
    if (this.claimed.has(claimId)) return false;
    this.claimed.add(claimId);
    if (item) this.inventory.set(item, (this.inventory.get(item) ?? 0) + amount);
    this.log.push({ t: this.clock, fact: `claim:${claimId}` });
    return true;
  }

  isClaimed(claimId: string): boolean {
    return this.claimed.has(claimId);
  }

  consume(item: string, amount = 1): boolean {
    const have = this.inventory.get(item) ?? 0;
    if (have < amount) return false;
    this.inventory.set(item, have - amount);
    return true;
  }

  count(item: string): number {
    return this.inventory.get(item) ?? 0;
  }

  addEvidence(id: string): boolean {
    if (this.evidence.includes(id)) return false;
    this.evidence.push(id);
    return true;
  }

  addLandmark(id: string): boolean {
    if (this.landmarks.includes(id)) return false;
    this.landmarks.push(id);
    return true;
  }

  serialize(): LedgerData {
    return {
      facts: Object.fromEntries(this.facts),
      irreversible: [...this.irreversible],
      inventory: Object.fromEntries(this.inventory),
      claimed: [...this.claimed],
      evidence: [...this.evidence],
      landmarks: [...this.landmarks],
      log: this.log.slice(-200),
    };
  }

  static from(data: LedgerData): StoryLedger {
    const l = new StoryLedger();
    for (const [k, v] of Object.entries(data.facts)) l.facts.set(k, v);
    for (const k of data.irreversible) l.irreversible.add(k);
    for (const [k, v] of Object.entries(data.inventory)) l.inventory.set(k, v);
    for (const k of data.claimed) l.claimed.add(k);
    l.evidence.push(...data.evidence);
    l.landmarks.push(...data.landmarks);
    l.log = [...data.log];
    return l;
  }
}
