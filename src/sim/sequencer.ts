// Scripted sequences written as generators: `yield 1.5` waits seconds, `yield () => cond` waits for a condition.
// Saves are only taken at checkpoints outside cinematics, so running generators never need serializing.

export type SeqYield = number | (() => boolean) | void;
export type SeqGen = Generator<SeqYield, void, void>;

interface Running {
  id: string;
  gen: SeqGen;
  wait: number;
  cond: (() => boolean) | null;
  cinematic: boolean;
  skippable: boolean;
  skipping: boolean;
}

export class Sequencer {
  private running: Running[] = [];

  start(id: string, gen: SeqGen, opts: { cinematic?: boolean; skippable?: boolean } = {}): void {
    this.stop(id);
    const r: Running = { id, gen, wait: 0, cond: null, cinematic: !!opts.cinematic, skippable: opts.skippable ?? !!opts.cinematic, skipping: false };
    this.running.push(r);
    this.step(r);
  }

  stop(id: string): void {
    this.running = this.running.filter((r) => r.id !== id);
  }

  isRunning(id: string): boolean {
    return this.running.some((r) => r.id === id);
  }

  get cinematicActive(): boolean {
    return this.running.some((r) => r.cinematic);
  }

  get canSkip(): boolean {
    return this.running.some((r) => r.cinematic && r.skippable);
  }

  /** Fast-forwards skippable cinematics: timed waits are dropped, conditions still respected. */
  skip(): void {
    for (const r of this.running) if (r.cinematic && r.skippable) r.skipping = true;
  }

  private step(r: Running): void {
    for (let guard = 0; guard < 500; guard++) {
      const res = r.gen.next();
      if (res.done) {
        this.running = this.running.filter((x) => x !== r);
        return;
      }
      const y = res.value;
      if (typeof y === 'number') {
        if (r.skipping) continue;
        r.wait = y;
        r.cond = null;
        return;
      }
      if (typeof y === 'function') {
        if (y()) continue;
        r.cond = y;
        r.wait = 0;
        return;
      }
      // bare yield = wait one tick
      if (!r.skipping) {
        r.wait = 0;
        r.cond = null;
        return;
      }
    }
  }

  update(dt: number): void {
    for (const r of [...this.running]) {
      if (!this.running.includes(r)) continue;
      if (r.cond) {
        if (!r.cond()) continue;
        r.cond = null;
      } else if (r.wait > 0 && !r.skipping) {
        r.wait -= dt;
        if (r.wait > 0) continue;
      }
      this.step(r);
    }
  }

  clear(): void {
    this.running = [];
  }
}
