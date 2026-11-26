import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { batchStaticWorld } from '../world/StaticBatching.js';
import { createBakedShadow, createShadowTexture } from '../vehicles/BakedShadow.js';

const WHEEL_RADIUS = 0.395;
const STEER_LIMIT = 0.42;
const DENT_POOL = 18;
const UP = new THREE.Vector3(0, 1, 0);

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

    this.damageLevel = 0;
    this.dentIndex = 0;
    const dentGeometry = new THREE.SphereGeometry(0.16, 9, 7);
    const vertex = new THREE.Vector3();
    const position = dentGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      vertex.multiplyScalar(1 + 0.22 * Math.sin(vertex.x * 41 + vertex.y * 27 + vertex.z * 53));
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    dentGeometry.computeVertexNormals();
    const dentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.48),
      roughness: 0.8,
      metalness: 0.3,
    });
    this.dents = new THREE.Group();
    this.dents.name = 'amassados do carro';
    this.vehicle.group.add(this.dents);
    this.dentPool = Array.from({ length: DENT_POOL }, () => {
      const lump = new THREE.Mesh(dentGeometry, dentMaterial);
      lump.visible = false;
      this.dents.add(lump);
      return lump;
    });
    this.hitPoints = [];
    this.repairPlate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.45,
      metalness: 0.45,
    }));
    this.repairPlate.name = 'peça de funilaria instalada';
    this.repairPlate.visible = false;
    this.dents.add(this.repairPlate);

    this.spin = 0;
    this.roll = 0;
    this.time = 0;
    this.damage = 0;
    this.group.add(createBakedShadow(createShadowTexture(), 2.5, 4.7));
  }

  addDent(worldPoint, severity = 0.6) {
    this.group.updateMatrixWorld(true);
    const point = this.dents.worldToLocal(worldPoint.clone());
    point.x = THREE.MathUtils.clamp(point.x, -2.02, 2.02);
    point.y = THREE.MathUtils.clamp(point.y, 0.34, 1.1);
    point.z = THREE.MathUtils.clamp(point.z, -0.86, 0.86);
    const lump = this.dentPool[this.dentIndex++ % DENT_POOL];
    const size = 0.65 + severity * 0.9;
    const normal =
      Math.abs(point.x) / 2.02 >= Math.abs(point.z) / 0.86
        ? new THREE.Vector3(Math.sign(point.x) || 1, 0, 0)
        : new THREE.Vector3(0, 0, Math.sign(point.z) || 1);
    const twist = new THREE.Quaternion().setFromAxisAngle(normal, Math.random() * Math.PI * 2);
    lump.quaternion.setFromUnitVectors(UP, normal).premultiply(twist);
    lump.scale.set(size * (0.9 + Math.random() * 0.5), size * 0.5, size * (0.8 + Math.random() * 0.5));
    lump.position.copy(point).addScaledVector(normal, -0.045);
    lump.visible = true;
    this.hitPoints.push(point.clone());
  }

  setDamage(level) {
    this.damage = Math.max(0, Math.min(1, level));
  }

  damageCentroid(out = new THREE.Vector3()) {
    if (!this.hitPoints.length) return out.set(-2, 0.62, 0);
    out.set(0, 0, 0);
    for (const point of this.hitPoints) out.add(point);
    return out.multiplyScalar(1 / this.hitPoints.length);
  }

  repairZone() {
    const centroid = this.damageCentroid(new THREE.Vector3());
    return Math.abs(centroid.x) / 2.02 >= Math.abs(centroid.z) / 0.86
      ? centroid.x < 0 ? 'front' : 'rear'
      : 'side';
  }

  repairFocus(point = new THREE.Vector3(), normal = new THREE.Vector3()) {
    this.group.updateMatrixWorld(true);
    const zone = this.repairZone();
    const centroid = this.damageCentroid(new THREE.Vector3());
    if (zone === 'side') normal.set(0, 0, Math.sign(centroid.z) || 1);
    else normal.set(Math.sign(centroid.x) || -1, 0, 0);
    point.copy(centroid);
    this.dents.localToWorld(point);
    normal.transformDirection(this.dents.matrixWorld);
    return zone;
  }

  hammerDent() {
    const lump = this.dentPool.find(item => item.visible);
    if (!lump) return false;
    lump.visible = false;
    return true;
  }

  installRepairPanel() {
    for (const lump of this.dentPool) lump.visible = false;
    const dims = new THREE.Vector3();
    const position = new THREE.Vector3();
    if (this.repairZone() === 'side') {
      const centroid = this.damageCentroid(new THREE.Vector3());
      dims.set(1.55, 0.34, 0.06);
      position.set(THREE.MathUtils.clamp(centroid.x, -0.9, 0.9), 0.62, Math.sign(centroid.z) * 0.88);
    } else {
      const centroid = this.damageCentroid(new THREE.Vector3());
      dims.set(0.06, 0.36, 1.5);
      position.set(Math.sign(centroid.x) * 2.04, 0.62, THREE.MathUtils.clamp(centroid.z, -0.45, 0.45));
    }
    this.repairPlate.scale.copy(dims);
    this.repairPlate.position.copy(position);
    this.repairPlate.visible = true;
  }

  settleRepair() {
    this.damage = 0;
    this.hitPoints = [];
    for (const lump of this.dentPool) lump.visible = false;
  }

  resetDamage() {
    this.damage = 0;
    this.dentIndex = 0;
    this.hitPoints = [];
    for (const lump of this.dentPool) lump.visible = false;
    this.repairPlate.visible = false;
  }

  update(dt, { speed = 0, steer = 0 } = {}) {
    const h = Math.min(Math.max(dt, 0), 0.05);
    this.time += h;
    this.spin += (speed * h) / WHEEL_RADIUS;
    for (const { wheel, baseYaw, front } of this.wheels) {
      wheel.rotation.y = baseYaw + (front ? steer * STEER_LIMIT : 0);
      wheel.rotation.z = this.spin;
    }
    const targetRoll = -steer * Math.min(1, Math.abs(speed) / 18) * 0.055;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-7 * h));
    this.body.rotation.z = this.roll;
    const rattle = this.damage * Math.min(1, Math.abs(speed) / 20) * 0.011;
    this.body.rotation.x = rattle * Math.sin(this.time * (13 + Math.abs(speed) * 0.6));
  }
}
