import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { batchStaticWorld } from '../world/StaticBatching.js';
import { createBakedShadow, createShadowTexture } from '../vehicles/BakedShadow.js';

const WHEEL_RADIUS = 0.395;
const STEER_LIMIT = 0.42;

/** Carro da pista: o mesmo veículo didático da oficina, com rodas girando e esterçando. */
export class DrivableCar {
  constructor(color = '#347d94') {
    this.group = new THREE.Group();
    this.group.name = 'carro-dirigivel';
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.vehicle = new Vehicle([0, 0, 0], { color, displayOnly: true });
    // O veículo didático aponta para -X; a pista usa +Z como frente.
    this.vehicle.group.rotation.y = Math.PI / 2;
    this.body.add(this.vehicle.group);

    this.wheels = this.vehicle.wheels.map(wheel => {
      wheel.traverse(object => { if (object.isMesh) object.userData.static = false; });
      return { wheel, baseYaw: wheel.rotation.y, front: wheel.position.x < 0 };
    });
    batchStaticWorld(this.vehicle.group);

    this.spin = 0;
    this.roll = 0;
    this.group.add(createBakedShadow(createShadowTexture(), 2.5, 4.7));
  }

  update(dt, { speed = 0, steer = 0 } = {}) {
    const h = Math.min(Math.max(dt, 0), 0.05);
    this.spin += (speed * h) / WHEEL_RADIUS;
    for (const { wheel, baseYaw, front } of this.wheels) {
      wheel.rotation.y = baseYaw + (front ? steer * STEER_LIMIT : 0);
      wheel.rotation.z = this.spin;
    }
    const targetRoll = -steer * Math.min(1, Math.abs(speed) / 18) * 0.055;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-7 * h));
    this.body.rotation.z = this.roll;
  }
}
