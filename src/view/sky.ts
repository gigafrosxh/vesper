import * as THREE from 'three';
import { radialTexture } from './geometry';
import { PALETTE } from './palette';

// Night sky of the Shattered Firmament: violet nebula, stars, a pale moon and the Observer's eye.

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uTwinkle;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uNebulaA;
uniform vec3 uNebulaB;
uniform float uForest;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));
  // Nebula band across the sky.
  float band = exp(-pow((d.y - 0.35 + d.x * 0.25) * 2.6, 2.0));
  float n = fbm(d * 3.0 + vec3(0.0, uTime * 0.004, 0.0));
  float n2 = fbm(d * 7.0 - 3.1);
  col += uNebulaA * band * smoothstep(0.35, 0.85, n) * 0.9;
  col += uNebulaB * band * smoothstep(0.55, 0.95, n2) * 0.45;
  // Stars, a few of them shattered fragments that drift.
  vec3 sp = d * 220.0;
  vec3 cell = floor(sp);
  float s = hash(cell);
  float star = smoothstep(0.985, 1.0, s) * smoothstep(0.55, 0.0, length(fract(sp) - 0.5));
  float tw = mix(1.0, 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0), uTwinkle);
  col += vec3(0.95, 0.92, 1.0) * star * tw * smoothstep(-0.05, 0.2, d.y);
  col = mix(col, col * vec3(0.7, 0.9, 0.85), uForest * 0.35);
  // Ground haze below the horizon.
  col = mix(col, uHorizon * 0.6, smoothstep(0.0, -0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

function eyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 256);
  // Almond outline with a soft glow.
  g.shadowColor = PALETTE.porcelain;
  g.shadowBlur = 24;
  g.strokeStyle = 'rgba(238,233,246,0.95)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(20, 128);
  g.quadraticCurveTo(256, -40, 492, 128);
  g.quadraticCurveTo(256, 296, 20, 128);
  g.closePath();
  g.stroke();
  g.fillStyle = 'rgba(30,24,60,0.55)';
  g.fill();
  return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace });
}

function irisTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 120);
  grd.addColorStop(0, '#17152B');
  grd.addColorStop(0.28, '#17152B');
  grd.addColorStop(0.32, '#a58be0');
  grd.addColorStop(0.8, '#6E56A6');
  grd.addColorStop(1, 'rgba(110,86,166,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.fill();
  // Thirteen ticks: the Observer keeps the wrong time.
  g.strokeStyle = 'rgba(238,233,246,0.8)';
  g.lineWidth = 4;
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60);
    g.lineTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
    g.stroke();
  }
  return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace });
}

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private eye: THREE.Sprite;
  private iris: THREE.Sprite;
  private eyeOpen = 0;
  private moon: THREE.Sprite;
  private bellGlow: THREE.Sprite;
  private bellLight: THREE.PointLight;

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uTwinkle: { value: 1 },
          uZenith: { value: new THREE.Color('#0b0a1a') },
          uHorizon: { value: new THREE.Color('#3a2c66') },
          uNebulaA: { value: new THREE.Color('#6E56A6') },
          uNebulaB: { value: new THREE.Color('#66BFD4') },
          uForest: { value: 0 },
        },
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const moonTex = radialTexture('rgba(238,233,246,1)', 'rgba(238,233,246,0)');
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false, fog: false, transparent: true }));
    this.moon.scale.setScalar(90);
    this.group.add(this.moon);
    const disk = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#f3effa', fog: false, depthWrite: false }));
    disk.scale.setScalar(0.32);
    this.moon.add(disk);

    this.eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.eye.scale.set(360, 180, 1);
    this.iris = new THREE.Sprite(new THREE.SpriteMaterial({ map: irisTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.iris.scale.set(150, 150, 1);
    this.group.add(this.eye, this.iris);

    this.bellGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(102,191,212,0.9)', 'rgba(102,191,212,0)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bellGlow.scale.setScalar(16);
    this.bellGlow.position.set(0, 25.5, 30);
    this.bellLight = new THREE.PointLight(PALETTE.cyan, 0, 40, 1.6);
    this.bellLight.position.set(0, 25, 30);
  }

  /** Scene-anchored parts (they are not centered on the camera). */
  attachWorld(scene: THREE.Scene): void {
    scene.add(this.bellGlow, this.bellLight);
  }

  update(dt: number, time: number, camera: THREE.Camera, visual: Record<string, number>, region: string, flashReduction: boolean, playerPos: THREE.Vector3): void {
    this.group.position.copy(camera.position);
    const u = this.dome.material.uniforms;
    u.uTime.value = time;
    u.uTwinkle.value = flashReduction ? 0 : 1;
    u.uForest.value += ((region === 'forest' ? 1 : 0) - u.uForest.value) * Math.min(1, dt * 0.8);
    this.moon.position.set(-260, 340, -520);

    const target = visual.observer ? 1 : 0;
    this.eyeOpen += (target - this.eyeOpen) * Math.min(1, dt * 0.6);
    const eyeDir = new THREE.Vector3(80, 380, -620);
    this.eye.position.copy(eyeDir);
    // The eye opens vertically like a lid.
    this.eye.scale.set(360, 180 * Math.max(0.02, this.eyeOpen), 1);
    (this.eye.material as THREE.SpriteMaterial).opacity = Math.min(1, this.eyeOpen * 1.4);
    // The iris follows Elian.
    const look = new THREE.Vector3(playerPos.x * 0.15, 0, playerPos.z * 0.1);
    this.iris.position.copy(eyeDir).add(new THREE.Vector3(THREE.MathUtils.clamp(look.x, -60, 60), THREE.MathUtils.clamp(-look.z * 0.3, -30, 30), 0));
    (this.iris.material as THREE.SpriteMaterial).opacity = Math.max(0, this.eyeOpen - 0.3) / 0.7;
    this.iris.scale.set(150, 150 * Math.max(0.02, this.eyeOpen), 1);

    const bell = visual.bell1 ? 1 : 0;
    const bm = this.bellGlow.material as THREE.SpriteMaterial;
    bm.opacity += (bell * 0.85 - bm.opacity) * Math.min(1, dt);
    this.bellLight.intensity = bm.opacity * 30;
  }
}
