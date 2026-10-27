import * as THREE from 'three';
import type { Sim } from '../sim/game';

// Third-person camera with collision, lock-on framing, cinematic overrides and accessible shake (UX §6).

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pivot = new THREE.Vector3();
  private look = new THREE.Vector3();
  private dist = 4.6;
  private trauma = 0;
  private shakeTime = 0;
  private override = 0;
  private initialized = false;
  shakeEnabled = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1400);
  }

  setFov(fov: number): void {
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  shake(strength: number, duration: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + strength);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  reset(): void {
    this.initialized = false;
  }

  update(sim: Sim, playerPos: THREE.Vector3, dt: number, time: number): void {
    const p = sim.player;
    const k = 1 - Math.exp(-dt * 10);
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.55, playerPos.z);
    if (!this.initialized) {
      this.pivot.copy(target);
      this.initialized = true;
    }
    // Smooth vertical motion (steps, mantles) more than horizontal motion.
    this.pivot.x = target.x;
    this.pivot.z = target.z;
    this.pivot.y += (target.y - this.pivot.y) * (1 - Math.exp(-dt * 8));

    const yaw = p.camYaw;
    const pitch = p.camPitch;
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const shoulder = this.pivot.clone().addScaledVector(right, 0.45);
    const wanted = p.lockTargetId ? 5.4 : 4.6;
    // Collision: pull the camera in front of walls, never through them.
    const hit = sim.world.raycast({ x: shoulder.x, y: shoulder.y, z: shoulder.z }, { x: back.x, y: back.y, z: back.z }, wanted + 0.4);
    const maxDist = Math.max(0.8, hit - 0.35);
    const d = Math.min(wanted, maxDist);
    // Pull in instantly, ease back out.
    this.dist = d < this.dist ? d : this.dist + (d - this.dist) * k * 0.5;
    const pos = shoulder.clone().addScaledVector(back, this.dist);
    const lookAt = shoulder.clone().addScaledVector(back, -6);

    const ov = sim.cameraOverride;
    this.override += ((ov ? 1 : 0) - this.override) * (1 - Math.exp(-dt * 3));
    if (ov) {
      const opos = new THREE.Vector3(ov.pos.x, ov.pos.y, ov.pos.z);
      const olook = new THREE.Vector3(ov.look.x, ov.look.y, ov.look.z);
      pos.lerp(opos, this.override);
      lookAt.lerp(olook, this.override);
    }
    this.camera.position.copy(pos);
    if (!this.look.lengthSq() || this.override > 0.01) this.look.copy(lookAt);
    else this.look.lerp(lookAt, 1);
    this.camera.lookAt(this.look);

    if (this.shakeTime > 0 && this.shakeEnabled) {
      this.shakeTime -= dt;
      const s = this.trauma * this.trauma * 0.12;
      this.camera.position.x += Math.sin(time * 47) * s;
      this.camera.position.y += Math.sin(time * 53 + 1) * s;
      this.camera.rotation.z += Math.sin(time * 31) * s * 0.3;
      if (this.shakeTime <= 0) this.trauma = 0;
      else this.trauma = Math.max(0, this.trauma - dt * 0.8);
    }
  }
}
