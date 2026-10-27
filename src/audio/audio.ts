import type { AudioLayer } from '../app/app';
import type { EventMap, EventName } from '../core/events';
import type { Settings } from '../settings/settings';
import type { Sim } from '../sim/game';

// Procedural audio (no third-party assets): a small synth for effects, generative music and ambience.
// Buses: music, sfx, ambience, voice/narration cues → master, with an optional mono downmix.

type Bus = 'music' | 'sfx' | 'ambience' | 'voice';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine implements AudioLayer {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private noiseBuf!: AudioBuffer;
  private settings: Settings | null = null;
  private listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private rewindVoice: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private music = { next: 0, step: 0, region: '', combat: 0 };
  private amb: { wind: GainNode; windFilter: BiquadFilterNode; crickets: GainNode } | null = null;
  private tickNext = 0;
  private enabled = typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';

  /** Browsers only allow audio after a user gesture. */
  resume(): void {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private init(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    for (const b of ['music', 'sfx', 'ambience', 'voice'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    if (this.settings) this.applySettings(this.settings);
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.audio.master, now, 0.05);
    this.buses.music.gain.setTargetAtTime(s.audio.music * 0.55, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.audio.sfx, now, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.audio.ambience * 0.7, now, 0.05);
    this.buses.voice.gain.setTargetAtTime(s.audio.voice, now, 0.05);
    const dest = this.ctx.destination;
    try {
      dest.channelCount = s.audio.mono ? 1 : Math.min(2, dest.maxChannelCount);
      dest.channelCountMode = 'explicit';
      dest.channelInterpretation = 'speakers';
    } catch {
      /* some devices refuse changes; stereo stays */
    }
  }

  // ---------------------------------------------------------------- primitives

  private out(bus: Bus, pos?: [number, number, number], volume = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let gain = volume;
    let pan = 0;
    if (pos) {
      const dx = pos[0] - this.listener.x;
      const dz = pos[2] - this.listener.z;
      const d = Math.hypot(dx, dz, pos[1] - this.listener.y);
      gain *= 1 / (1 + Math.max(0, d - 2) / 7);
      // Right vector of the camera: (cos yaw, -sin yaw).
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw)) / d)) * 0.8 : 0;
    }
    g.gain.value = gain;
    if (pan !== 0 && !this.settings?.audio.mono) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.buses[bus]);
    } else g.connect(this.buses[bus]);
    return g;
  }

  private tone(dest: AudioNode, freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; slideTo?: number; detune?: number } = {}): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(dest: AudioNode, start: number, dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; attack?: number; sweepTo?: number } = {}): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, start);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  /** Inharmonic bell partials; a "wrong" bell is detuned and sour, a lawful bell is pure. */
  private bell(dest: AudioNode, t: number, base: number, lawful: boolean, gain = 0.3, dur = 4): void {
    const partials = lawful ? [1, 2, 3, 4.2, 5.4] : [1, 2.13, 2.76, 4.07, 5.9];
    partials.forEach((p, i) => this.tone(dest, base * p, t, dur / (1 + i * 0.4), { gain: gain / (1 + i), attack: 0.003, detune: lawful ? 0 : (i % 2 ? 18 : -22) }));
  }

  // ---------------------------------------------------------------- sound catalogue

  play(id: string, pos?: [number, number, number], volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const ui = id.startsWith('ui_') || id === 'dial_tick';
    const o = this.out(ui ? 'sfx' : 'sfx', pos, volume);
    switch (id) {
      case 'ui_move':
        this.tone(o, 1320, t, 0.05, { type: 'triangle', gain: 0.06 });
        break;
      case 'ui_confirm':
        this.tone(o, 880, t, 0.08, { type: 'triangle', gain: 0.1 });
        this.tone(o, 1320, t + 0.05, 0.12, { type: 'triangle', gain: 0.08 });
        break;
      case 'ui_back':
        this.tone(o, 660, t, 0.1, { type: 'triangle', gain: 0.08, slideTo: 440 });
        break;
      case 'ui_page':
        this.noise(o, t, 0.12, { freq: 3000, q: 0.7, gain: 0.08, sweepTo: 1500 });
        break;
      case 'ui_lock':
        this.tone(o, 520, t, 0.1, { type: 'square', gain: 0.04 });
        break;
      case 'dial_tick':
        this.noise(o, t, 0.03, { freq: 4000, q: 4, gain: 0.25 });
        break;
      case 'dial_wrong':
        this.tone(o, 180, t, 0.25, { type: 'square', gain: 0.08, slideTo: 120 });
        break;
      case 'bell_strike':
        this.bell(this.out('sfx', undefined, 0.8), t, 196, true, 0.25, 3.5);
        break;
      case 'bell_strike_wrong':
        this.bell(this.out('sfx', undefined, 0.9), t, 185, false, 0.32, 5);
        break;
      case 'bell_lawful':
        this.bell(o, t, 392, true, 0.3, 4);
        break;
      case 'bell_lawful_big':
        this.bell(this.out('sfx', undefined, 1), t, 130.8, true, 0.4, 7);
        this.bell(this.out('sfx', undefined, 0.6), t + 0.02, 261.6, true, 0.2, 6);
        break;
      case 'bell_crash':
        this.bell(o, t, 150, false, 0.3, 2.5);
        this.noise(o, t, 0.4, { freq: 600, gain: 0.35, type: 'lowpass' });
        break;
      case 'step':
        this.noise(this.out('sfx', undefined, volume * 0.5), t, 0.07, { freq: 900, q: 0.8, gain: 0.12, type: 'lowpass' });
        break;
      case 'swing':
      case 'swing_heavy':
        this.noise(this.out('sfx'), t, id === 'swing' ? 0.18 : 0.3, { freq: 600, q: 1.5, gain: 0.18, sweepTo: 2400, attack: 0.04 });
        break;
      case 'hit':
        this.tone(o, 140, t, 0.12, { type: 'sine', gain: 0.4, slideTo: 60 });
        this.noise(o, t, 0.08, { freq: 2000, gain: 0.2 });
        break;
      case 'hit_armor':
        this.tone(o, 1800, t, 0.3, { type: 'triangle', gain: 0.15, detune: 30 });
        this.tone(o, 2650, t, 0.25, { type: 'sine', gain: 0.1 });
        break;
      case 'dodge':
        this.noise(this.out('sfx'), t, 0.25, { freq: 400, gain: 0.15, sweepTo: 1600, attack: 0.05 });
        break;
      case 'climb':
        this.noise(this.out('sfx'), t, 0.15, { freq: 700, gain: 0.1, type: 'lowpass' });
        break;
      case 'pickup':
        [0, 4, 7, 12].forEach((n, i) => this.tone(this.out('sfx'), midi(76 + n), t + i * 0.06, 0.4, { type: 'triangle', gain: 0.08 }));
        break;
      case 'evidence':
        [0, 3, 7, 10, 14].forEach((n, i) => this.tone(this.out('sfx'), midi(69 + n), t + i * 0.09, 0.8, { gain: 0.06 }));
        break;
      case 'assemble':
        for (let i = 0; i < 8; i++) this.noise(this.out('sfx'), t + i * 0.13, 0.03, { freq: 5000, q: 6, gain: 0.2 });
        this.tone(this.out('sfx'), midi(81), t + 1.1, 0.8, { type: 'triangle', gain: 0.1 });
        break;
      case 'rewind_commit':
        this.tone(this.out('sfx'), 300, t, 0.6, { type: 'sawtooth', gain: 0.06, slideTo: 1200 });
        this.tone(this.out('sfx'), midi(88), t + 0.3, 1.2, { gain: 0.08 });
        break;
      case 'rewind_cancel':
        this.tone(this.out('sfx'), 600, t, 0.25, { type: 'sine', gain: 0.08, slideTo: 300 });
        break;
      case 'rewind_fail':
        this.tone(this.out('sfx'), 220, t, 0.18, { type: 'square', gain: 0.05 });
        this.tone(this.out('sfx'), 207, t + 0.12, 0.2, { type: 'square', gain: 0.05 });
        break;
      case 'anchor':
        [48, 55, 60].forEach((n) => this.tone(this.out('sfx'), midi(n), t, 1.5, { type: 'triangle', gain: 0.08, attack: 0.05 }));
        break;
      case 'lantern_crash':
      case 'glass_shatter':
        for (let i = 0; i < 6; i++) this.tone(o, 2000 + Math.random() * 3000, t + Math.random() * 0.15, 0.25, { type: 'triangle', gain: 0.06 });
        this.noise(o, t, 0.3, { freq: 5000, q: 0.5, gain: 0.2, type: 'highpass' });
        break;
      case 'glass_settle':
        this.noise(o, t, 0.2, { freq: 6000, q: 2, gain: 0.08 });
        break;
      case 'span_crash':
      case 'rumble':
        this.noise(o, t, id === 'rumble' ? 1.8 : 1.2, { freq: 160, q: 0.6, gain: 0.5, type: 'lowpass', attack: 0.08 });
        this.tone(o, 55, t, 1.2, { gain: 0.3, slideTo: 35 });
        break;
      case 'door_open':
      case 'gate_open':
      case 'vault_open':
        this.noise(o, t, id === 'gate_open' ? 2.2 : 0.9, { freq: 300, q: 3, gain: 0.25, sweepTo: 180, attack: 0.1 });
        this.tone(o, id === 'vault_open' ? 110 : 90, t, 0.8, { type: 'square', gain: 0.05, slideTo: 70 });
        break;
      case 'lever':
        this.tone(o, 300, t, 0.15, { type: 'square', gain: 0.07, slideTo: 200 });
        this.noise(o, t + 0.1, 0.6, { freq: 2500, q: 8, gain: 0.08 });
        break;
      case 'lever_stuck':
        this.tone(o, 160, t, 0.15, { type: 'square', gain: 0.06 });
        break;
      case 'chain_release':
        for (let i = 0; i < 10; i++) this.noise(o, t + i * 0.05, 0.04, { freq: 3500, q: 5, gain: 0.12 });
        break;
      case 'door_slam':
        this.tone(o, 70, t, 0.4, { gain: 0.5, slideTo: 40 });
        this.noise(o, t, 0.25, { freq: 400, gain: 0.3, type: 'lowpass' });
        break;
      case 'gramophone':
        this.noise(o, t, 12, { freq: 2500, q: 0.4, gain: 0.03, attack: 0.3 });
        break;
      case 'hollow_emerge':
      case 'roots_grow':
        this.noise(o, t, 1.2, { freq: 200, q: 2, gain: 0.25, sweepTo: 700, attack: 0.2 });
        break;
      case 'root_erupt':
        this.noise(o, t, 0.5, { freq: 300, gain: 0.4, type: 'lowpass' });
        break;
      case 'roots_settle':
        this.noise(o, t, 0.4, { freq: 250, gain: 0.15, type: 'lowpass' });
        break;
      case 'hollow_death':
      case 'rootbound_death':
      case 'sentinel_death':
        this.tone(o, id === 'sentinel_death' ? 110 : 330, t, 1.2, { type: 'sawtooth', gain: 0.08, slideTo: 60 });
        this.noise(o, t, 0.8, { freq: 1200, gain: 0.12, sweepTo: 200 });
        break;
      case 'sentinel_wake':
        this.bell(o, t, 98, false, 0.35, 3);
        this.noise(o, t, 1.5, { freq: 120, gain: 0.3, type: 'lowpass', attack: 0.3 });
        break;
      case 'observer_open':
        [36, 43, 46].forEach((n) => this.tone(this.out('sfx'), midi(n), t, 5, { type: 'sawtooth', gain: 0.05, attack: 1.5 }));
        break;
      case 'forest_loop':
        this.tone(this.out('sfx'), 800, t, 0.9, { gain: 0.08, slideTo: 200 });
        this.noise(this.out('sfx'), t, 0.9, { freq: 1500, gain: 0.08, sweepTo: 300 });
        break;
      case 'mira_appear':
        for (let i = 0; i < 6; i++) this.tone(o, midi(84 + i * 2), t + i * 0.05, 0.5, { gain: 0.05 });
        break;
      case 'fair_music':
        this.musicBox(this.out('music', undefined, 1.4), t);
        break;
      case 'evidence_found':
        break;
      default:
        if (id.endsWith('_strike') || id.endsWith('_swing')) this.noise(o, t, 0.2, { freq: 900, gain: 0.15, sweepTo: 2000 });
    }
  }

  private musicBox(dest: AudioNode, t: number): void {
    const melody = [76, 79, 83, 81, 79, 76, 74, 76, 79, 76, 72, 74, 76];
    melody.forEach((n, i) => this.tone(dest, midi(n), t + i * 0.32, 1.1, { type: 'triangle', gain: 0.08 }));
  }

  // ---------------------------------------------------------------- music & ambience

  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.6;
    const wind = ctx.createGain();
    wind.gain.value = 0.06;
    src.connect(windFilter).connect(wind).connect(this.buses.ambience);
    src.start();
    const cr = ctx.createOscillator();
    cr.frequency.value = 4200;
    const crAm = ctx.createGain();
    crAm.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(crAm.gain);
    const crickets = ctx.createGain();
    crickets.gain.value = 0;
    cr.connect(crAm).connect(crickets).connect(this.buses.ambience);
    cr.start();
    lfo.start();
    this.amb = { wind, windFilter, crickets };
  }

  /** A slow generative score: 13 steps per bar (the wrong hour), minor in Clockfall, whole-tone in the forest. */
  private scheduleMusic(sim: Sim | null): void {
    const ctx = this.ctx!;
    const region = sim?.region ?? 'menu';
    const combat = sim ? [...sim.enemies.values()].some((e) => e.alive && e.aggro) : false;
    this.music.combat += ((combat ? 1 : 0) - this.music.combat) * 0.2;
    const stepDur = 0.46;
    while (this.music.next < ctx.currentTime + 0.3) {
      const t = Math.max(this.music.next, ctx.currentTime + 0.02);
      const s = this.music.step++;
      const bar = Math.floor(s / 13);
      const pos = s % 13;
      const out = this.buses.music;
      const forest = region === 'forest';
      const scale = forest ? [0, 2, 4, 6, 8, 10] : [0, 2, 3, 5, 7, 8, 10];
      const root = forest ? 62 : 57;
      const chordRoots = forest ? [0, 2, -2, 4] : [0, -4, -7, -2];
      const cr = chordRoots[bar % chordRoots.length];
      if (pos === 0) {
        // Pad.
        for (const n of [0, 7, 12 + (forest ? 4 : 3)]) this.tone(out, midi(root - 12 + cr + n), t, stepDur * 13, { type: 'triangle', gain: 0.035, attack: 1.2 });
      }
      // Sparse music-box notes.
      const h = Math.sin(s * 12.9898) * 43758.5453;
      const r = h - Math.floor(h);
      if (r < (forest ? 0.42 : 0.33)) {
        const deg = scale[Math.floor(r * 100) % scale.length];
        this.tone(out, midi(root + 12 + cr + deg), t, 1.4, { type: 'sine', gain: 0.03 });
      }
      // Combat layer: low pulses on beats 0, 4, 8 (still 13-step).
      if (this.music.combat > 0.3 && (pos === 0 || pos === 4 || pos === 8 || pos === 11)) {
        this.tone(out, 55, t, 0.3, { gain: 0.12 * this.music.combat, slideTo: 40 });
        this.noise(out, t, 0.12, { freq: 1800, gain: 0.03 * this.music.combat });
      }
      this.music.next = t + (combat ? stepDur * 0.75 : stepDur);
    }
  }

  // ---------------------------------------------------------------- layer interface

  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void {
    if (!this.ctx) return;
    switch (type) {
      case 'sound': {
        const e = payload as EventMap['sound'];
        this.play(e.id, e.position, e.volume ?? 1);
        break;
      }
      case 'rewind.commit':
        this.play('rewind_commit');
        break;
      case 'rewind.cancel':
        this.play('rewind_cancel');
        break;
      case 'rewind.failed':
      case 'anchor.failed':
        this.play('rewind_fail');
        break;
      case 'anchor.set':
        this.play('anchor');
        break;
      case 'evidence.found':
        break;
      case 'subtitle': {
        // A soft chirp marks Mira speaking (narration cue on the voice bus).
        const e = payload as EventMap['subtitle'];
        if (e.speaker === 'speaker.mira' && this.ctx.state === 'running') {
          const t = this.ctx.currentTime + 0.01;
          this.tone(this.out('voice'), 700, t, 0.18, { type: 'sine', gain: 0.05, slideTo: 980 });
        }
        break;
      }
      case 'player.damaged':
        this.play('hit', undefined, 0.8);
        break;
    }
  }

  update(sim: Sim | null, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (sim) this.listener = { x: sim.player.pos.x, y: sim.player.pos.y + 1.6, z: sim.player.pos.z, yaw: sim.player.camYaw };
    this.scheduleMusic(sim);
    // Ambience by region: wind everywhere, crickets in the forest, the village's clock ticking in 13s.
    if (this.amb) {
      const forest = sim?.region === 'forest';
      const indoor = sim && (sim.area === 'area.workshop' || sim.area === 'area.cellar' || sim.area === 'area.orven');
      this.amb.wind.gain.setTargetAtTime(indoor ? 0.015 : 0.06, ctx.currentTime, 0.5);
      this.amb.windFilter.frequency.setTargetAtTime(300 + Math.sin(ctx.currentTime * 0.2) * 150, ctx.currentTime, 0.5);
      this.amb.crickets.gain.setTargetAtTime(forest ? 0.006 : 0, ctx.currentTime, 0.8);
      if (sim && !forest && ctx.currentTime > this.tickNext) {
        this.tickNext = ctx.currentTime + 1;
        this.noise(this.buses.ambience, ctx.currentTime + 0.01, 0.025, { freq: 3800, q: 8, gain: indoor ? 0.05 : 0.025 });
      }
    }
    // Rewind preview: a reversed shimmer while scrubbing.
    const previewing = !!sim?.temporal.preview;
    if (previewing && !this.rewindVoice) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 220;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(osc.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.1);
      osc.connect(f).connect(gain).connect(this.buses.sfx);
      osc.start();
      lfo.start();
      this.rewindVoice = { osc, gain, lfo };
    } else if (previewing && this.rewindVoice && sim?.temporal.preview) {
      this.rewindVoice.osc.frequency.setTargetAtTime(220 - Math.min(160, sim.temporal.preview.offset * 0.4), ctx.currentTime, 0.05);
    } else if (!previewing && this.rewindVoice) {
      const v = this.rewindVoice;
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      v.osc.stop(ctx.currentTime + 0.3);
      v.lfo.stop(ctx.currentTime + 0.3);
      this.rewindVoice = null;
    }
    void dt;
  }
}
