import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { VehicleMotion } from '../src/machines/VehicleMotion.js';
import { resolveWorkshopArea, insideWorkshop } from '../src/core/AreaZones.js';
import { createOutdoorArea } from '../src/world/OutdoorArea.js';
import { DrivingSystem } from '../src/systems/DrivingSystem.js';
import { CollisionSystem } from '../src/core/CollisionSystem.js';

const config = JSON.parse(readFileSync(new URL('../public/data/workshop.json', import.meta.url)));

function canvasDocument() {
  return {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {}, strokeRect() {}, fillText() {}, stroke() {},
        beginPath() {}, moveTo() {}, lineTo() {},
      }),
    }),
  };
}

function simulate(motion, seconds, input) {
  for (let i = 0; i < seconds * 60; i++) motion.step(1 / 60, input);
}

test('física arcade acelera, freia, engata ré e sustenta derrapagem com freio de mão', () => {
  const motion = new VehicleMotion({ position: [0, 0], heading: 0 });
  let maxDrift = 0;
  for (let i = 0; i < 480; i++) {
    motion.step(1 / 60, { throttle: 1 });
    assert.ok(Number.isFinite(motion.x) && Number.isFinite(motion.z));
    if (i > 5) assert.equal(motion.gear, 'D');
  }
  assert.ok(motion.speedKmh > 90, `velocidade ${motion.speedKmh}`);
  assert.ok(motion.z > 20);
  const heading = motion.heading;
  let sawDrift = false;
  for (let i = 0; i < 120; i++) {
    motion.step(1 / 60, { throttle: 1, steer: 1, handbrake: true });
    maxDrift = Math.max(maxDrift, Math.abs(motion.lateralSpeed));
    sawDrift = sawDrift || motion.drifting;
  }
  assert.ok(Math.abs(motion.heading - heading) > 0.4);
  assert.ok(maxDrift > 2.4, `escorregamento ${maxDrift}`);
  assert.ok(sawDrift);

  const reverse = new VehicleMotion({ position: [0, 0], heading: 0 });
  simulate(reverse, 1, { throttle: -1 });
  assert.equal(reverse.gear, 'R');
  assert.ok(reverse.z < -1);
  assert.equal(reverse.step(0, { throttle: 1 }), false);
  reverse.setPose(3, 4, 0);
  assert.deepEqual([reverse.x, reverse.z, reverse.vx, reverse.vz], [3, 4, 0, 0]);
});

test('aceleração progressiva com teto de 150 km/h', () => {
  const motion = new VehicleMotion({ position: [0, 0], heading: 0 });
  let zeroTo100 = null, fastest = 0;
  for (let i = 0; i < 60 * 30; i++) {
    motion.step(1 / 60, { throttle: 1 });
    fastest = Math.max(fastest, motion.speedKmh);
    if (zeroTo100 === null && motion.speedKmh >= 100) zeroTo100 = (i + 1) / 60;
  }
  assert.ok(zeroTo100 !== null && zeroTo100 > 5, `0-100 rápido demais: ${zeroTo100}`);
  assert.ok(fastest <= 150.4, `ultrapassou o teto: ${fastest}`);
  assert.ok(motion.speedKmh > 149, `não alcançou o teto: ${motion.speedKmh}`);
});

test('esterço vira para o lado da tecla: D à direita, A à esquerda', () => {
  const right = new VehicleMotion({ position: [0, 0], heading: 0 });
  simulate(right, 1.5, { throttle: 1, steer: 1 });
  assert.ok(right.heading < -0.2, `heading D ${right.heading}`);
  assert.ok(right.x < 0, `x D ${right.x}`);
  const left = new VehicleMotion({ position: [0, 0], heading: 0 });
  simulate(left, 1.5, { throttle: 1, steer: -1 });
  assert.ok(left.heading > 0.2, `heading A ${left.heading}`);
  assert.ok(left.x > 0, `x A ${left.x}`);
});

test('culling resolve interior, faixa do portão e pátio', () => {
  const p = (x, z) => new THREE.Vector3(x, 1.65, z);
  assert.equal(insideWorkshop(p(0, 0), config), true);
  assert.equal(insideWorkshop(p(0, 15.2), config), false);
  const inside = resolveWorkshopArea(p(0, 0), p(0, 0), false, config);
  assert.deepEqual(inside, { area: 'inside', inside: true });
  const doorway = resolveWorkshopArea(p(config.reconstruction.gate.x, 14), p(0, 0), false, config);
  assert.equal(doorway.area, 'both');
  const outside = resolveWorkshopArea(
    p(config.driving.spawn[0], config.driving.spawn[1]),
    p(config.driving.spawn[0], config.driving.spawn[1]),
    false,
    config,
  );
  assert.deepEqual(outside, { area: 'outside', inside: false });
  // Ao dirigir, a área segue o carro mesmo quando a câmera está no limite.
  const driving = resolveWorkshopArea(p(0, 25), p(0, 0), true, config);
  assert.deepEqual(driving, { area: 'inside', inside: false });
});

test('pátio externo cria pista, vegetação e cerca com vão no portão', () => {
  const original = globalThis.document;
  globalThis.document = canvasDocument();
  try {
    const scene = new THREE.Scene();
    const collision = new CollisionSystem(config.playerRadius);
    const outdoor = createOutdoorArea(scene, collision, config);
    assert.equal(scene.children.includes(outdoor.root), true);
    assert.ok(outdoor.root.getObjectByName('pista asfáltica'));
    assert.ok(outdoor.root.getObjectByName('árvores do pátio').count > 20);
    assert.ok(outdoor.root.getObjectByName('arbustos').count > 50);
    assert.ok(outdoor.backdrop.getObjectByName('linha de árvores distante'));
    assert.deepEqual(outdoor.layout.spawn, config.driving.spawn);
    assert.equal(outdoor.layout.heading, config.driving.heading);
    assert.equal(collision.blocked(config.driving.spawn[0], config.driving.spawn[1]), false);
    assert.equal(collision.blocked(config.reconstruction.gate.x, config.reconstruction.gate.z), false);
    assert.equal(collision.blocked(0, 15), true);
    assert.equal(outdoor.lights.hemi.isHemisphereLight, true);
    assert.equal(outdoor.lights.sun.isDirectionalLight, true);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});

test('derrapagem solta fumaça em puffs reciclados que se dissipam ao parar', () => {
  const scene = new THREE.Scene();
  const collision = new CollisionSystem(config.playerRadius);
  const camera = new THREE.PerspectiveCamera();
  const controls = {
    keys: new Set(), stick: { x: 0, y: 0 }, active: true, yaw: 0, pitch: 0,
    clear() { this.keys.clear(); this.stick.x = this.stick.y = 0; },
    applyRotation() {},
  };
  const engine = {
    scene, camera, collision, controls, config,
    outdoor: { layout: { spawn: config.driving.spawn, heading: config.driving.heading } },
  };
  const driving = new DrivingSystem(engine);
  camera.position.set(config.driving.spawn[0], config.eyeHeight, config.driving.spawn[1] + 2);
  assert.equal(driving.enter(), true);
  controls.keys.add('KeyW');
  for (let i = 0; i < 300; i++) driving.update(1 / 60);
  assert.equal(driving.smoke.live, 0);
  controls.keys.add('KeyD');
  controls.keys.add('Space');
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    driving.update(1 / 60);
    peak = Math.max(peak, driving.smoke.live);
  }
  assert.ok(peak > 0, 'nenhuma fumaça emitida');
  assert.equal(driving.smoke.mesh.visible, true);
  assert.ok([...driving.smoke.opacities.array].some(value => value > 0));
  assert.equal(driving.smoke.mesh.count, driving.smoke.particles.length);
  controls.keys.clear();
  assert.equal(driving.exit(), true);
  for (let i = 0; i < 180; i++) driving.update(1 / 60);
  assert.equal(driving.smoke.live, 0);
  assert.equal(driving.smoke.mesh.visible, false);
  driving.reset();
  assert.equal(driving.smoke.live, 0);
});

test('carro dirigível entra, acelera, freia e devolve o jogador ao sair', () => {
  const scene = new THREE.Scene();
  const collision = new CollisionSystem(config.playerRadius);
  const camera = new THREE.PerspectiveCamera();
  const controls = {
    keys: new Set(), stick: { x: 0, y: 0 }, active: true, yaw: 0, pitch: 0,
    clear() { this.keys.clear(); this.stick.x = this.stick.y = 0; },
    applyRotation() {},
  };
  const engine = {
    scene, camera, collision, controls, config,
    outdoor: { layout: { spawn: config.driving.spawn, heading: config.driving.heading } },
  };
  const driving = new DrivingSystem(engine);
  camera.position.set(config.driving.spawn[0], config.eyeHeight, config.driving.spawn[1] + 2);
  assert.equal(driving.enter(), true);
  assert.equal(driving.active, true);
  assert.equal(driving.collider.enabled, false);
  const startX = driving.motion.x, startZ = driving.motion.z;
  controls.keys.add('KeyW');
  for (let i = 0; i < 90; i++) driving.update(1 / 60);
  assert.ok(Math.hypot(driving.motion.x - startX, driving.motion.z - startZ) > 3);
  assert.ok(driving.motion.speedKmh > 20);
  assert.ok(driving.car.group.position.x > startX);
  controls.keys.clear();
  assert.equal(driving.exit(), true);
  assert.equal(driving.active, false);
  assert.equal(driving.collider.enabled, true);
  assert.equal(camera.position.y, config.eyeHeight);
  assert.ok(driving.car.group.position.equals(new THREE.Vector3(driving.motion.x, 0, driving.motion.z)));
  driving.reset();
  assert.deepEqual([driving.motion.x, driving.motion.z], config.driving.spawn);
});

function drivingRig() {
  const scene = new THREE.Scene();
  const collision = new CollisionSystem(config.playerRadius);
  const camera = new THREE.PerspectiveCamera();
  const controls = {
    keys: new Set(), stick: { x: 0, y: 0 }, active: true, yaw: 0, pitch: 0,
    clear() { this.keys.clear(); this.stick.x = this.stick.y = 0; },
    applyRotation() {},
  };
  const engine = {
    scene, camera, collision, controls, config,
    outdoor: { layout: { spawn: config.driving.spawn, heading: config.driving.heading } },
  };
  const driving = new DrivingSystem(engine);
  camera.position.set(config.driving.spawn[0], config.eyeHeight, config.driving.spawn[1]);
  return { driving, controls, collision, camera };
}

test('batida em alta velocidade amassa o carro e a funilaria manual restaura', () => {
  const { driving, controls, collision } = drivingRig();
  const [sx, sz] = config.driving.spawn;
  collision.addBox(sx + 30, sz, 6, 6, 'muro de teste');
  assert.equal(driving.enter(), true);
  let impact = 0;
  driving.onCrash = (damage, kmh) => { impact = kmh; };
  controls.keys.add('KeyW');
  let hit = false;
  for (let i = 0; i < 60 * 8 && !hit; i++) {
    driving.update(1 / 60);
    hit = driving.needsRepair;
  }
  controls.keys.clear();
  assert.ok(hit, 'o carro não colidiu com o muro');
  assert.ok(impact >= 25, `impacto a ${impact} km/h`);
  assert.ok(driving.damage > 0.25);
  assert.equal(driving.car.damage, driving.damage);
  const dents = driving.car.dentPool.filter(lump => lump.visible);
  assert.ok(dents.length >= 2);
  for (const lump of dents) {
    assert.ok(Math.abs(lump.position.x) <= 2.03);
    assert.ok(Math.abs(lump.position.z) <= 0.87);
    assert.ok(lump.position.y >= 0.33 && lump.position.y <= 1.11);
  }
  assert.equal(driving.needsRepair, true);
  assert.equal(driving.car.repairZone(), 'front');
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  assert.equal(driving.car.repairFocus(point, normal), 'front');
  assert.ok(Math.abs(normal.length() - 1) < 0.01);
  assert.ok(point.distanceTo(driving.car.group.position) < 3.2);
  assert.equal(driving.car.hammerDent(), true);
  assert.equal(driving.car.dentPool.filter(lump => lump.visible).length, dents.length - 1);
  driving.car.installRepairPanel();
  assert.equal(driving.car.dentPool.some(lump => lump.visible), false);
  assert.equal(driving.car.repairPlate.visible, true);
  let repairs = 0;
  driving.onRepair = () => { repairs++; };
  assert.equal(driving.repair(), true);
  assert.equal(repairs, 1);
  assert.equal(driving.damage, 0);
  assert.equal(driving.car.damage, 0);
  assert.equal(driving.needsRepair, false);
  assert.equal(driving.car.dentPool.some(lump => lump.visible), false);
  assert.equal(driving.car.repairPlate.visible, true, 'a peça nova permanece instalada');
  assert.equal(driving.motion.maxSpeed, driving.baseMaxSpeed);
  assert.equal(driving.repair(), false);
  driving.reset();
  assert.equal(driving.car.repairPlate.visible, false);
});

test('pista livre em alta velocidade não causa dano fantasma', () => {
  const { driving, controls } = drivingRig();
  assert.equal(driving.enter(), true);
  controls.keys.add('KeyW');
  for (let i = 0; i < 60 * 20; i++) driving.update(1 / 60);
  assert.ok(driving.motion.speedKmh > 120, `velocidade ${driving.motion.speedKmh}`);
  assert.equal(driving.damage, 0);
  assert.equal(driving.needsRepair, false);
});

test('toque leve não amassa e dano grave limita a velocidade até o reparo', () => {
  const { driving, controls, collision } = drivingRig();
  const [sx, sz] = config.driving.spawn;
  collision.addBox(sx + 4.8, sz, 6, 6, 'muro próximo');
  assert.equal(driving.enter(), true);
  controls.keys.add('KeyW');
  for (let i = 0; i < 180; i++) driving.update(1 / 60);
  controls.keys.clear();
  assert.equal(driving.damage, 0);
  assert.equal(driving.car.dentPool.some(lump => lump.visible), false);

  driving.crash(30, 1, 0);
  driving.crash(30, 1, 0);
  driving.crash(30, 1, 0);
  assert.equal(driving.damage, 1);
  assert.ok(Math.abs(driving.motion.maxSpeed * 3.6 - 55) < 0.6);
  assert.ok(driving.car.dentPool.filter(lump => lump.visible).length <= 18);
  driving.reset();
  assert.equal(driving.damage, 0);
  assert.equal(driving.motion.maxSpeed, driving.baseMaxSpeed);
  assert.equal(driving.car.dentPool.some(lump => lump.visible), false);
});

test('limite de velocidade do dano respeita o teto do veículo', () => {
  const motion = new VehicleMotion({ position: [0, 0], heading: 0 });
  motion.maxSpeed = 55 / 3.6;
  simulate(motion, 25, { throttle: 1 });
  assert.ok(motion.speedKmh <= 55.4, `limite ignorado: ${motion.speedKmh}`);
  motion.maxSpeed = 150;
  simulate(motion, 25, { throttle: 1 });
  assert.ok(motion.speedKmh > 140);
});
