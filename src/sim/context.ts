import type { EventBus } from '../core/events';
import type { Rng } from '../core/math';
import type { StoryLedger } from '../time/ledger';
import type { TemporalService } from '../time/temporal';
import type { CollisionWorld } from './physics';
import type { Player } from './player';

export interface SimOptions {
  aimAssist: 'off' | 'low' | 'high';
  rewindWindow: number;
}

/** Shared services handed to every gameplay system. */
export interface SimContext {
  bus: EventBus;
  world: CollisionWorld;
  temporal: TemporalService;
  ledger: StoryLedger;
  player: Player;
  rng: Rng;
  tick: number;
  time: number;
  options: SimOptions;
}
