import * as THREE from 'three';
import { DECOR } from '../content/level';
import type { EventMap, EventName } from '../core/events';
import type { Quality } from '../settings/settings';
import type { Enemy } from '../sim/enemies';
import type { Sim } from '../sim/game';
import { Prop } from '../sim/props';
import type { TemporalTarget } from '../time/temporal';
import { EnemyView, MiraView, NpcView, PlayerView } from './actors';
import { CameraRig } from './cameraRig';
import { buildDecor, type DecorBuild } from './decor';
import { HazardViews, Particles } from './fx';
import { PALETTE } from './palette';
import { PropView } from './props';
import { Sky } from './sky';
import { buildStaticWorld, type StaticWorld } from './staticWorld';

// Presentation layer: reads simulation state and events, never mutates gameplay (Architecture: layers).

export interface ViewOptions {
  quality: Quality;
  brightness: number;
  fov: number;
  shake: boolean;
  flashReduction: boolean;
}

const STATUS_COLORS = { eligible: PALETTE.cyan, blocked: '#8a8396', unsafe: PALETTE.amber };

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private sky = new Sky();
  private moonLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lampLights: THREE.PointLight[] = [];
  private interiorLights: THREE.PointLight[] = [];
  private fog = new THREE.FogExp2('#1d1836', 0.014);
  private particles = new Particles();
  private hazards = new HazardViews();

  private sim: Sim | null = null;
  private world: StaticWorld | null = null;
  private worldKey = '';
  private decor: DecorBuild | null = null;
  private dynamic = new THREE.Group();
  private player = new PlayerView();
  private mira = new MiraView();
  private props = new Map<string, PropView>();
  private enemies = new Map<string, EnemyView>();
  private npcs: NpcView[] = [];
  private ghost: { id: string; view: PropView | EnemyView } | null = null;
  private outline: { id: string; view: PropView | EnemyView; mat: THREE.MeshBasicMaterial } | null = null;
  private anchorShell: { id: string; view: PropView | EnemyView } | null = null;
  private ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.38, depthWrite: false });
  private anchorMat = new THREE.MeshBasicMaterial({ color: PALETTE.porcelain, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.BackSide });
  private time = 0;
  private lampTimer = 0;
  private opts: ViewOptions;

  constructor(canvas: HTMLCanvasElement, opts: ViewOptions) {
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(PALETTE.ink);

    this.hemi = new THREE.HemisphereLight('#8a76cc', '#2a2440', 1.35);
    this.moonLight = new THREE.DirectionalLight('#c9c3f2', 1.5);
    this.moonLight.position.set(-30, 60, -40);
    this.moonLight.shadow.camera.left = this.moonLight.shadow.camera.bottom = -32;
    this.moonLight.shadow.camera.right = this.moonLight.shadow.camera.top = 32;
    this.moonLight.shadow.camera.far = 160;
    this.moonLight.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.moonLight, this.moonLight.target, this.sky.group);
    this.sky.attachWorld(this.scene);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffd9a0', 0, 14, 1.6);
      this.lampLights.push(l);
      this.scene.add(l);
    }
    // Warm interior lights: Elian's workshop and Orven's cellar.
    for (const [x, y, z, c, i] of [
      [0, 3.6, 72, '#ffcf96', 14],
      [-4.5, 1.8, 75, '#ffcf96', 6],
      [0, -1.6, -75, '#ffd9a0', 12],
      [0, -1.8, -82, '#9fd8e6', 8],
      [0, 4.5, -56, '#ffcf96', 10],
    ] as const) {
      const l = new THREE.PointLight(c, i, 16, 1.6);
      l.position.set(x, y, z);
      this.interiorLights.push(l);
      this.scene.add(l);
    }
    this.scene.add(this.dynamic, this.particles.points, this.hazards.group);
    this.dynamic.add(this.player.object, this.mira.root);
    this.applyOptions(opts);
  }

  applyOptions(opts: ViewOptions): void {
    this.opts = opts;
    const dpr = window.devicePixelRatio || 1;
    const ratio = opts.quality === 'low' ? Math.min(1, dpr) * 0.75 : opts.quality === 'medium' ? Math.min(1.25, dpr) : Math.min(2, dpr);
    this.renderer.setPixelRatio(ratio);
    const shadows = opts.quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.moonLight.castShadow = shadows;
    const size = opts.quality === 'high' ? 2048 : 1024;
    if (this.moonLight.shadow.mapSize.x !== size) {
      this.moonLight.shadow.mapSize.set(size, size);
      this.moonLight.shadow.map?.dispose();
      this.moonLight.shadow.map = null;
    }
    this.lampLights.forEach((l, i) => (l.visible = opts.quality === 'high' ? true : opts.quality === 'medium' ? i < 4 : i < 2));
    this.renderer.toneMappingExposure = 1.15 * opts.brightness;
    this.rig.setFov(opts.fov);
    this.rig.shakeEnabled = opts.shake;
    this.resize();
  }

  resize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
  }

  /** Binds the view to a (new) simulation; static geometry is reused when the level is identical. */
  attach(sim: Sim): void {
    this.sim = sim;
    const propIds = new Set(sim.props.keys());
    const key = `${sim.world.boxes.length}:${DECOR.length}`;
    if (key !== this.worldKey) {
      if (this.world) this.scene.remove(this.world.group);
      if (this.decor) this.scene.remove(this.decor.group);
      for (const n of this.npcs) this.scene.remove(n.h.root);
      this.world = buildStaticWorld(sim.world, propIds);
      this.decor = buildDecor(DECOR);
      this.npcs = DECOR.filter((d) => d.type.startsWith('npc_')).map((d) => new NpcView(d));
      this.scene.add(this.world.group, this.decor.group, ...this.npcs.map((n) => n.h.root));
      this.worldKey = key;
    } else if (this.world) {
      // Same geometry, but door boxes belong to the new simulation.
      for (const [owner, d] of this.world.doors) {
        const b = sim.world.boxes.find((x) => x.owner === owner && x.id === d.box.id);
        if (b) d.box = b;
      }
    }
    for (const v of this.props.values()) this.dynamic.remove(v.object);
    this.props.clear();
    for (const p of sim.props.values()) {
      const v = new PropView(p);
      this.props.set(p.id, v);
      this.dynamic.add(v.object);
    }
    for (const v of this.enemies.values()) this.dynamic.remove(v.object);
    this.enemies.clear();
    this.clearTemporalViews();
    this.player.snap(sim.player);
    this.mira.snap(sim.mira);
    this.rig.reset();
  }

  /** Records tick positions for interpolation; call after every simulation step. */
  capture(): void {
    const sim = this.sim;
    if (!sim) return;
    this.player.capture(sim.player);
    this.mira.capture(sim.mira);
    for (const v of this.enemies.values()) v.capture();
  }

  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void {
    const pos = (p?: [number, number, number]) => (p ? new THREE.Vector3(p[0], p[1], p[2]) : null);
    switch (type) {
      case 'camera.shake': {
        const e = payload as EventMap['camera.shake'];
        this.rig.shake(e.strength, e.duration);
        break;
      }
      case 'sound': {
        const e = payload as EventMap['sound'];
        const at = pos(e.position);
        if (!at) break;
        if (/crash|impact|collapse/.test(e.id)) this.particles.burst(at, '#b3a6cf', 40, 4, 1.2, 6, 1.2);
        else if (e.id === 'glass_shatter') this.particles.burst(at, '#cfe8f0', 30, 3, 0.8, 5, 0.3);
        else if (e.id === 'root_erupt') this.particles.burst(at, '#7a5a46', 26, 5, 0.9, 9, 0.8);
        else if (e.id.endsWith('_death')) this.particles.burst(at.add(new THREE.Vector3(0, 1, 0)), '#a58be0', 50, 2.5, 1.4, -0.5, 0.6);
        else if (e.id === 'hit' || e.id === 'hit_armor') this.particles.burst(at.add(new THREE.Vector3(0, 1.2, 0)), e.id === 'hit' ? PALETTE.porcelain : PALETTE.amber, 12, 4, 0.35, 6, 0.2);
        break;
      }
      case 'rewind.commit': {
        const e = payload as EventMap['rewind.commit'];
        const t = this.sim?.temporal.get(e.targetId);
        if (t && this.sim) {
          const to = new THREE.Vector3(t.getPosition().x, t.getPosition().y, t.getPosition().z);
          this.particles.burst(to, PALETTE.cyan, 60, 2.2, 1.2, -0.6, 1);
          const from = new THREE.Vector3(this.sim.player.pos.x, this.sim.player.pos.y + 1.2, this.sim.player.pos.z);
          this.particles.stream(from, to, PALETTE.cyan, 40);
        }
        break;
      }
      case 'anchor.set': {
        const e = payload as EventMap['anchor.set'];
        const t = this.sim?.temporal.get(e.targetId);
        if (t) this.particles.burst(new THREE.Vector3(t.getPosition().x, t.getPosition().y, t.getPosition().z), PALETTE.porcelain, 40, 1.5, 1.2, 0, 0.8);
        break;
      }
    }
  }

  private viewFor(t: TemporalTarget, material: THREE.Material): PropView | EnemyView | null {
    if (t instanceof Prop) return new PropView(t).useMaterial(material);
    const e = this.sim?.enemies.get(t.id);
    return e ? new EnemyView(e).useMaterial(material) : null;
  }

  private clearTemporalViews(): void {
    for (const s of [this.ghost, this.outline, this.anchorShell]) if (s) this.dynamic.remove(s.view.object);
    this.ghost = this.outline = this.anchorShell = null;
  }

  /** Poses a temporal view from a captured state without disturbing the simulation. */
  private poseFromState(view: PropView | EnemyView, t: TemporalTarget, state: number[] | null): void {
    if (view instanceof PropView) view.apply(state ?? undefined);
    else {
      const e = t as Enemy;
      if (state) {
        const live = e.capture();
        e.restore(state);
        view.pose(e, this.time, false);
        e.restore(live);
      } else view.pose(e, this.time, false);
    }
  }

  private updateTemporalViews(sim: Sim): void {
    // Ghost preview of the scrubbed state (UC-02 step 3).
    const pv = sim.temporal.preview;
    if (pv) {
      const t = sim.temporal.get(pv.targetId);
      if (t && this.ghost?.id !== pv.targetId) {
        if (this.ghost) this.dynamic.remove(this.ghost.view.object);
        const v = this.viewFor(t, this.ghostMat);
        this.ghost = v ? { id: pv.targetId, view: v } : null;
        if (v) this.dynamic.add(v.object);
      }
      if (t && this.ghost) {
        this.poseFromState(this.ghost.view, t, pv.ghost);
        this.ghostMat.opacity = 0.3 + Math.sin(this.time * 6) * 0.08;
      }
    } else if (this.ghost) {
      this.dynamic.remove(this.ghost.view.object);
      this.ghost = null;
    }

    // Target outline with status colour; shape/icons are added by the HUD (colour-independent cue).
    const target = sim.target && !pv ? sim.target : null;
    if (target) {
      if (this.outline?.id !== target.target.id) {
        if (this.outline) this.dynamic.remove(this.outline.view.object);
        const mat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false });
        const v = this.viewFor(target.target, mat);
        this.outline = v ? { id: target.target.id, view: v, mat } : null;
        if (v) this.dynamic.add(v.object);
      }
      if (this.outline) {
        this.outline.mat.color.set(STATUS_COLORS[target.status.kind]);
        this.outline.mat.opacity = 0.45 + Math.sin(this.time * 4) * 0.15;
        this.poseFromState(this.outline.view, target.target, null);
        const s = 1.06 + Math.sin(this.time * 4) * 0.015;
        const obj = this.outline.view.object;
        obj.scale.setScalar(s);
        // Props scale around the target's centre; enemy rigs are rooted at their feet already.
        if (this.outline.view instanceof PropView) {
          const c = target.target.getPosition();
          obj.position.set(c.x * (1 - s), c.y * (1 - s), c.z * (1 - s));
        }
      }
    } else if (this.outline) {
      this.dynamic.remove(this.outline.view.object);
      this.outline = null;
    }

    // Anchored object: a pale frozen shell (FR-015).
    const anchor = sim.temporal.anchor;
    if (anchor) {
      const t = sim.temporal.get(anchor.targetId);
      if (t && this.anchorShell?.id !== anchor.targetId) {
        if (this.anchorShell) this.dynamic.remove(this.anchorShell.view.object);
        const v = this.viewFor(t, this.anchorMat);
        this.anchorShell = v ? { id: anchor.targetId, view: v } : null;
        if (v) this.dynamic.add(v.object);
      }
      if (t && this.anchorShell) {
        this.poseFromState(this.anchorShell.view, t, null);
        const s = 1.1;
        const c = t.getPosition();
        const obj = this.anchorShell.view.object;
        obj.scale.setScalar(s);
        obj.position.set(c.x * (1 - s), c.y * (1 - s), c.z * (1 - s));
        this.anchorMat.opacity = 0.22 + (anchor.remaining < 1.5 ? Math.abs(Math.sin(this.time * 6)) * 0.2 : 0.06);
      }
    } else if (this.anchorShell) {
      this.dynamic.remove(this.anchorShell.view.object);
      this.anchorShell = null;
    }
  }

  private syncEnemies(sim: Sim): void {
    for (const [id, e] of sim.enemies) {
      if (!this.enemies.has(id)) {
        const v = new EnemyView(e);
        this.enemies.set(id, v);
        this.dynamic.add(v.object);
      }
    }
    for (const [id, v] of this.enemies) {
      if (!sim.enemies.has(id)) {
        this.dynamic.remove(v.object);
        this.enemies.delete(id);
      }
    }
  }

  render(dt: number, alpha: number): void {
    const sim = this.sim;
    if (!sim) return;
    this.time += dt;
    const t = this.time;
    this.syncEnemies(sim);

    const rewinding = !!sim.temporal.preview;
    this.player.update(sim.player, alpha, t, rewinding);
    this.mira.update(sim.mira, alpha, t);
    for (const v of this.props.values()) v.apply();
    for (const v of this.enemies.values()) v.pose(v.enemy, t, true, alpha);
    for (const n of this.npcs) n.update(t);
    this.updateTemporalViews(sim);
    this.hazards.update(sim.hazards, t);
    this.particles.update(dt);

    if (this.world) {
      const pp = this.player.object.position;
      for (const r of this.world.roofs) {
        const inside = pp.x > r.min.x && pp.x < r.max.x && pp.z > r.min.z && pp.z < r.max.z && pp.y < r.min.y;
        r.mesh.visible = !inside;
      }
      for (const d of this.world.doors.values()) d.mesh.visible = d.box.enabled !== false;
      const fold = sim.visual.fold ?? 0;
      for (const f of this.world.folds) {
        const target = fold * (0.35 + 0.25 * Math.sin(t * 0.35 + f.seed * 1.7));
        f.group.rotation.x += (target * (f.seed % 2 ? 1 : -1) - f.group.rotation.x) * Math.min(1, dt * 0.8);
        f.group.position.y += (fold * (2 + f.seed) - f.group.position.y) * Math.min(1, dt * 0.5);
      }
    }
    if (this.decor?.carousel) this.decor.carousel.rotation.y = t * 0.35;

    // Region mood: village violet, forest teal-green and denser; cellar darker.
    const forest = sim.region === 'forest';
    const indoor = sim.area === 'area.cellar' || sim.area === 'area.workshop' || sim.area === 'area.orven';
    const fogTarget = new THREE.Color(forest ? '#16232b' : '#1d1836');
    this.fog.color.lerp(fogTarget, Math.min(1, dt * 1.5));
    const densTarget = (forest ? 0.026 : indoor ? 0.02 : 0.013) * (this.opts.quality === 'low' ? 1.3 : 1);
    this.fog.density += (densTarget - this.fog.density) * Math.min(1, dt * 1.5);
    (this.scene.background as THREE.Color).copy(this.fog.color);

    this.rig.update(sim, this.player.object.position, dt, t);
    const cam = this.rig.camera;
    // Shadow frustum follows the player.
    const pp = this.player.object.position;
    this.moonLight.position.set(pp.x - 30, pp.y + 60, pp.z - 40);
    this.moonLight.target.position.copy(pp);

    // Nearest street lamps get real lights.
    this.lampTimer -= dt;
    if (this.lampTimer <= 0 && this.decor) {
      this.lampTimer = 0.3;
      const sorted = [...this.decor.lamps].sort((a, b) => a.distanceToSquared(pp) - b.distanceToSquared(pp));
      this.lampLights.forEach((l, i) => {
        const p = sorted[i];
        if (p && p.distanceTo(pp) < 45) {
          l.position.copy(p);
          l.intensity = 9;
        } else l.intensity = 0;
      });
    }
    this.sky.update(dt, t, cam, sim.visual, sim.region, this.opts.flashReduction, pp);
    this.renderer.render(this.scene, cam);
  }

  /** Projects a world point to CSS pixels (for HUD markers). */
  project(p: { x: number; y: number; z: number }): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.rig.camera);
    const c = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight, visible: v.z < 1 && v.z > -1 };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
