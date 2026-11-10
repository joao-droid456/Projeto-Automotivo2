import * as THREE from 'three';
import { Vehicle } from '../objects/Vehicle.js';
import { batchStaticWorld } from './StaticBatching.js';
import { advanceDriving } from '../systems/DrivingPhysics.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';

export const RACE_RADIUS = 70;
export const RACE_LAPS = 2;
const TAU = Math.PI * 2;
export function raceProgress(previous, angle, radius) {
  const delta = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
  return Math.abs(radius - RACE_RADIUS) < 8 && Math.abs(delta) < 0.2 ? delta / TAU : 0;
}

export class Race {
  constructor(engine, onFinish, onStatus = () => {}) {
    this.engine = engine;
    this.onFinish = onFinish;
    this.onStatus = onStatus;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a9d3ed');
    this.scene.fog = new THREE.Fog('#a9d3ed', 140, 280);
    this.camera = new THREE.PerspectiveCamera(65, engine.camera.aspect, 0.08, 350);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#658051', 2.5));
    const sun = new THREE.DirectionalLight('#fff1d7', 2.5);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    const root = new THREE.Group();
    this.scene.add(root);
    const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const grass = mat('#678650'),
      road = mat('#343c43'),
      white = mat('#eee9dd'),
      red = mat('#b84c40');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    root.add(ground);
    const ring = (inner, outer, material, y) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      root.add(mesh);
    };
    ring(62, 78, road, 0);
    ring(61.4, 62, white, 0.02);
    ring(78, 78.6, white, 0.02);
    const box = (size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.userData.static = true;
      root.add(mesh);
      return mesh;
    };
    for (let i = 0; i < 160; i++) {
      const angle = (i / 160) * TAU;
      for (const radius of [61, 79]) {
        box(
          [2.8, 0.12, 0.8],
          [Math.sin(angle) * radius, 0.04, Math.cos(angle) * radius],
          i % 2 ? white : red,
        ).rotation.y = angle;
      }
      if (i % 3 === 0)
        box([1.5, 0.02, 0.14], [Math.sin(angle) * 70, 0.03, Math.cos(angle) * 70], white).rotation.y = angle;
    }
    for (let i = 0; i < 16; i++) box([1, 0.025, 1], [i % 2, 0.05, 62.5 + i], i % 2 ? white : road);
    const foliage = mat('#3a653c'),
      bark = mat('#705039');
    for (let i = 0; i < 55; i++) {
      const angle = (i / 55) * TAU,
        radius = 95 + (i % 5) * 6;
      const x = Math.sin(angle) * radius,
        z = Math.cos(angle) * radius;
      box([0.5, 3, 0.5], [x, 1.5, z], bark);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7, 7), foliage);
      crown.position.set(x, 5.5, z);
      crown.userData.static = true;
      root.add(crown);
    }
    batchStaticWorld(root);
    this.player = { speed: 0, lateralSpeed: 0, steering: 0, heading: -Math.PI / 2, progress: 0, angle: 0 };
    this.player.car = new Vehicle([0, 0, 73], { displayOnly: true, color: '#e26e38' });
    this.opponents = ['#3f80c9', '#d4b747', '#7957b5', '#e5e8df'].map((color, i) => ({
      car: new Vehicle([-5 - Math.floor(i / 2) * 6, 0, i % 2 ? 73 : 67], { displayOnly: true, color }),
      progress: (-5 - Math.floor(i / 2) * 6) / (TAU * 70),
      speed: 0,
      targetSpeed: 22.5 + i * 0.65,
      radius: i % 2 ? 73 : 67,
    }));
    for (const racer of [this.player, ...this.opponents]) {
      batchStaticWorld(racer.car.group);
      this.scene.add(racer.car.group);
      racer.car.group.rotation.y = -Math.PI;
    }
    this.countdown = 3;
    this.elapsed = 0;
    this.camera.position.set(-8, 4.5, 73);
    this.camera.lookAt(6, 1, 73);
  }
  get position() {
    return (
      1 +
      this.opponents.filter(other => other.finishTime != null || other.progress > this.player.progress).length
    );
  }
  update(dt) {
    this.onStatus(this);
    if (!this.engine.controls.active || this.finished) return;
    dt = Math.min(dt, 0.05);
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }
    this.elapsed += dt;
    const { keys: k, stick } = this.engine.controls;
    if (k.has('KeyR')) {
      const a = this.player.angle;
      this.player.car.group.position.set(Math.sin(a) * 70, 0, Math.cos(a) * 70);
      Object.assign(this.player, { speed: 0, lateralSpeed: 0, steering: 0, heading: a - Math.PI / 2 });
    }
    const throttle =
      Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown')) - stick.y;
    const steer =
      Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')) + stick.x;
    const motion = advanceDriving(this.player, throttle, steer, k.has('Space'), dt);
    const p = this.player.car.group.position;
    const x = p.x + motion.x,
      z = p.z + motion.z;
    const radius = Math.hypot(x, z);
    if (radius > 63 && radius < 77) p.set(x, 0, z);
    else {
      this.player.speed *= Math.exp(-8 * dt);
      this.player.lateralSpeed *= Math.exp(-12 * dt);
    }
    const angle = Math.atan2(p.x, p.z);
    this.player.progress += raceProgress(this.player.angle, angle, Math.hypot(p.x, p.z));
    this.player.angle = angle;
    this.player.car.group.rotation.y = this.player.heading - Math.PI / 2;
    for (const other of this.opponents) {
      if (other.finishTime != null) continue;
      other.speed = Math.min(other.targetSpeed, other.speed + 6 * dt);
      other.progress += (other.speed * dt) / (TAU * other.radius);
      const a = other.progress * TAU;
      other.car.group.position.set(Math.sin(a) * other.radius, 0, Math.cos(a) * other.radius);
      other.car.group.rotation.y = a - Math.PI;
      if (other.progress >= RACE_LAPS) other.finishTime = this.elapsed;
      // Keep vehicles solid and avoid pushing the player through the verge.
      if (p.distanceTo(other.car.group.position) < 2.6) {
        this.player.speed *= Math.exp(-4 * dt);
        other.speed *= Math.exp(-2 * dt);
      }
    }
    const h = this.player.heading;
    this.camera.position.lerp(
      new THREE.Vector3(p.x + Math.sin(h) * 8, 4.5, p.z + Math.cos(h) * 8),
      1 - Math.exp(-7 * dt),
    );
    this.camera.lookAt(p.x - Math.sin(h) * 5, 1, p.z - Math.cos(h) * 5);
    if (this.player.progress >= RACE_LAPS) {
      this.finished = true;
      this.onFinish({ position: this.position, time: this.elapsed });
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeObject3D(this.scene);
    this.scene.clear();
  }
}
