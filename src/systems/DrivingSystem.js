import * as THREE from 'three';
import { VehicleMotion } from '../machines/VehicleMotion.js';
import { DrivableCar } from '../objects/DrivableCar.js';
import { SkidMarks } from '../objects/SkidMarks.js';
import { DriftSmoke } from '../objects/DriftSmoke.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const CAR_RADIUS = 1.15;
const CRASH_MIN_KMH = 25;
const LIMP_DAMAGE = 0.62;
const LIMP_KMH = 55;

export class DrivingSystem {
  constructor(engine) {
    this.engine = engine;
    const { spawn, heading } = engine.outdoor.layout;
    this.car = new DrivableCar();
    engine.scene.add(this.car.group);
    this.motion = new VehicleMotion({ position: spawn, heading });
    this.baseMaxSpeed = this.motion.maxSpeed;
    this.active = false;
    this.nearby = false;
    this.touchHandbrake = false;
    this.marks = new SkidMarks(engine.scene);
    this.smoke = new DriftSmoke(engine.scene);
    this.smokeTimer = 0;
    this.probe = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.lastMark = [null, null];
    this.damage = 0;
    this.crashCooldown = 0;
    this.shake = 0;
    this.onCrash = null;
    this.onRepair = null;
    this.collider = engine.collision.addBox(spawn[0], spawn[1], 2.1, 4.5, 'carro-dirigivel');
    this.applyPose();
    this.updateCollider();
  }

  get needsRepair() {
    return this.damage > 0.02;
  }

  applyPose() {
    this.car.group.position.set(this.motion.x, 0, this.motion.z);
    this.car.group.rotation.y = this.motion.heading;
  }

  updateCollider() {
    Object.assign(this.collider, {
      minX: this.motion.x - 1.05, maxX: this.motion.x + 1.05,
      minZ: this.motion.z - 2.25, maxZ: this.motion.z + 2.25,
    });
  }

  isNearby() {
    const camera = this.engine.camera.position;
    return Math.hypot(camera.x - this.motion.x, camera.z - this.motion.z) < 4.4;
  }

  readInput() {
    const controls = this.engine.controls, keys = controls.keys;
    const has = (...codes) => codes.some(code => keys.has(code));
    return {
      throttle: clamp(Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')) - controls.stick.y, -1, 1),
      steer: clamp(Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')) + controls.stick.x, -1, 1),
      handbrake: has('Space') || this.touchHandbrake,
    };
  }

  update(dt) {
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    this.shake *= Math.exp(-7 * dt);
    if (!this.active) {
      this.nearby = this.isNearby();
      this.smoke.update(dt, this.engine.camera);
      return;
    }
    const input = this.readInput();
    const previousX = this.motion.x, previousZ = this.motion.z;
    this.motion.step(dt, input);
    const movedX = this.motion.x - previousX, movedZ = this.motion.z - previousZ;
    const impactSpeed = this.motion.speed;
    this.probe.set(previousX, 0, previousZ);
    const blocked = this.engine.collision.move(this.probe, movedX, movedZ, CAR_RADIUS);
    if (blocked) {
      const h = Math.min(dt, 0.05);
      this.motion.x = this.probe.x; this.motion.z = this.probe.z;
      this.motion.vx = (this.probe.x - previousX) / h;
      this.motion.vz = (this.probe.z - previousZ) / h;
      this.motion.syncAxes();
    }
    if (blocked && this.crashCooldown <= 0 && impactSpeed * 3.6 >= CRASH_MIN_KMH) {
      const distance = Math.hypot(movedX, movedZ) || 1;
      this.crash(impactSpeed, movedX / distance, movedZ / distance);
    }
    this.applyPose();
    this.updateCollider();
    this.car.update(dt, {
      speed: this.motion.longitudinalSpeed,
      steer: this.motion.steer,
      brake: input.throttle < 0 && this.motion.longitudinalSpeed > 0.4,
    });
    this.updateMarks(input);
    this.updateSmoke(dt, input);
    this.updateCamera(dt);
  }

  updateSmoke(dt, input) {
    this.smoke.update(dt, this.engine.camera);
    const slipping =
      this.motion.drifting || (input.handbrake && Math.abs(this.motion.longitudinalSpeed) > 4);
    if (!slipping) {
      this.smokeTimer = 0;
      return;
    }
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    const slip = Math.min(1, Math.abs(this.motion.lateralSpeed) / 5 + (input.handbrake ? 0.4 : 0));
    this.smokeTimer = 0.055 - slip * 0.025;
    const sin = Math.sin(this.motion.heading), cos = Math.cos(this.motion.heading);
    for (const side of [-1, 1]) {
      const wx = this.motion.x + side * 0.84 * cos - 1.21 * sin;
      const wz = this.motion.z - side * 0.84 * sin - 1.21 * cos;
      this.smoke.emit(wx, wz, 0.55 + slip * 0.7, this.motion.vx, this.motion.vz);
    }
  }

  updateMarks(input) {
    const slipping = this.motion.drifting || (input.handbrake && Math.abs(this.motion.longitudinalSpeed) > 4);
    if (!slipping) {
      this.lastMark[0] = this.lastMark[1] = null;
      return;
    }
    const sin = Math.sin(this.motion.heading), cos = Math.cos(this.motion.heading);
    for (const [index, side] of [[0, -1], [1, 1]]) {
      const wx = this.motion.x + side * 0.84 * cos - 1.21 * sin;
      const wz = this.motion.z - side * 0.84 * sin - 1.21 * cos;
      const last = this.lastMark[index];
      if (!last || Math.hypot(wx - last.x, wz - last.z) > 0.34) {
        this.marks.stamp(wx, wz, this.motion.heading);
        this.lastMark[index] = { x: wx, z: wz };
      }
    }
  }

  updateCamera(dt, snap = false) {
    const sin = Math.sin(this.motion.heading), cos = Math.cos(this.motion.heading);
    const speed = Math.abs(this.motion.longitudinalSpeed);
    const distance = 6.2 + Math.min(2.4, speed * 0.07);
    const height = 2.5 + Math.min(0.7, speed * 0.02);
    const camera = this.engine.camera;
    this.cameraTarget.set(this.motion.x - sin * distance, height, this.motion.z - cos * distance);
    if (snap) camera.position.copy(this.cameraTarget);
    else camera.position.lerp(this.cameraTarget, 1 - Math.exp(-5 * dt));
    this.lookTarget.set(this.motion.x + sin * 4.5, 1.15, this.motion.z + cos * 4.5);
    camera.lookAt(this.lookTarget);
    if (this.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
  }

  crash(speed, nx, nz) {
    const severity = clamp((speed * 3.6 - CRASH_MIN_KMH) / 65, 0, 1);
    this.damage = Math.min(1, this.damage + 0.3 + severity * 0.55);
    this.car.setDamage(this.damage);
    const px = -nz, pz = nx;
    const dents = 2 + Math.round(severity * 4);
    for (let i = 0; i < dents; i++) {
      const lateral = (Math.random() - 0.5) * 1.2;
      const forward = 1.7 + Math.random() * 0.55;
      this.car.addDent(
        new THREE.Vector3(
          this.motion.x + nx * forward + px * lateral,
          0.42 + Math.random() * 0.42,
          this.motion.z + nz * forward + pz * lateral,
        ),
        0.3 + severity * 0.7,
      );
    }
    this.shake = 0.1 + severity * 0.22;
    this.crashCooldown = 0.9;
    if (this.damage >= LIMP_DAMAGE) this.motion.maxSpeed = LIMP_KMH / 3.6;
    this.onCrash?.(this.damage, Math.round(speed * 3.6));
  }

  repair() {
    if (!this.needsRepair) return false;
    this.damage = 0;
    this.shake = 0;
    this.car.settleRepair();
    this.motion.maxSpeed = this.baseMaxSpeed;
    this.onRepair?.();
    return true;
  }

  enter() {
    if (this.active || !this.isNearby()) return false;
    this.active = true;
    this.nearby = false;
    this.collider.enabled = false;
    this.engine.controls.clear();
    this.motion.vx = this.motion.vz = 0;
    this.motion.syncAxes();
    this.updateCamera(0, true);
    return true;
  }

  findPlayerSpot() {
    const h = this.motion.heading, cos = Math.cos(h), sin = Math.sin(h);
    for (const [lx, lz] of [[-2.5, 0], [2.5, 0], [0, -3.4], [0, 3.4], [-2.9, 1.8], [2.9, 1.8]]) {
      const x = this.motion.x + lx * cos + lz * sin;
      const z = this.motion.z - lx * sin + lz * cos;
      if (!this.engine.collision.blocked(x, z)) return { x, z };
    }
    return null;
  }

  exit() {
    if (!this.active) return false;
    const spot = this.findPlayerSpot();
    this.active = false;
    this.motion.vx = this.motion.vz = 0;
    this.motion.syncAxes();
    this.car.update(0, { speed: 0, steer: 0 });
    this.collider.enabled = true;
    this.updateCollider();
    this.engine.controls.clear();
    if (!spot) {
      this.engine.controls.reset();
      return true;
    }
    this.engine.camera.position.set(spot.x, this.engine.config.eyeHeight, spot.z);
    const yaw = Math.atan2(-(this.motion.x - spot.x), -(this.motion.z - spot.z));
    this.engine.controls.yaw = yaw;
    this.engine.controls.pitch = -0.06;
    this.engine.controls.applyRotation();
    return true;
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.motion.vx = this.motion.vz = 0;
    this.motion.syncAxes();
    this.collider.enabled = true;
    this.updateCollider();
    this.touchHandbrake = false;
  }

  reset() {
    const { spawn, heading } = this.engine.outdoor.layout;
    this.active = false;
    this.nearby = false;
    this.touchHandbrake = false;
    this.damage = 0;
    this.crashCooldown = 0;
    this.shake = 0;
    this.motion.setPose(spawn[0], spawn[1], heading);
    this.motion.maxSpeed = this.baseMaxSpeed;
    this.car.resetDamage();
    this.collider.enabled = true;
    this.applyPose();
    this.updateCollider();
    this.car.update(0, { speed: 0, steer: 0 });
    this.marks.clear();
    this.smoke.clear();
    this.smokeTimer = 0;
    this.lastMark[0] = this.lastMark[1] = null;
  }

  placePlayerNearCar() {
    const spot = this.findPlayerSpot();
    if (!spot) return false;
    this.engine.camera.position.set(spot.x, this.engine.config.eyeHeight, spot.z);
    this.engine.controls.yaw = Math.atan2(-(this.motion.x - spot.x), -(this.motion.z - spot.z));
    this.engine.controls.pitch = -0.08;
    this.engine.controls.applyRotation();
    return true;
  }

  releaseInputs() {
    this.touchHandbrake = false;
  }
}
