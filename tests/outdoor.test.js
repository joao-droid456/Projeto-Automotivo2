import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Outdoor } from '../src/world/Outdoor.js';
import { buildArchitecture } from '../src/world/Architecture.js';
import { CollisionSystem } from '../src/core/CollisionSystem.js';
import { Engine } from '../src/core/Engine.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';
import { GatePassage } from '../src/objects/GatePassage.js';
import { InteractionSystem } from '../src/systems/InteractionSystem.js';

const config = JSON.parse(readFileSync(new URL('../public/data/workshop.json', import.meta.url)));
function setup() {
  const engine = {
    config,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    collision: new CollisionSystem(config.playerRadius),
    controls: {
      active: true,
      keys: new Set(),
      stick: { x: 0, y: 0 },
      clear() {
        this.keys.clear();
      },
      applyRotation() {},
    },
  };
  engine.camera.position.fromArray(config.spawn);
  engine.outdoor = new Outdoor(engine);
  return engine;
}

test('portão sólido bloqueia movimento e visão, e a interação permite atravessar nos dois sentidos', () => {
  const engine = setup();
  const { collision, camera } = engine;
  const root = new THREE.Group();
  engine.scene.add(root);
  const material = new THREE.MeshStandardMaterial();
  buildArchitecture(root, new Proxy({}, { get: () => material }), collision, config);
  const gate = config.reconstruction.gate;
  camera.position.set(gate.x, config.eyeHeight, 13.5);
  collision.move(camera.position, 0, 4);
  assert.ok(camera.position.z < 15);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(gate.x, 1.65, 13), new THREE.Vector3(0, 0, 1));
  const hit = ray.intersectObject(root, true)[0];
  assert.equal(hit.object.name, 'portão sólido fechado');
  assert.equal(hit.object.material.transparent, false);
  const passage = new GatePassage(engine);
  engine.scene.add(passage.outline);
  engine.registry = { items: new Map([[passage.data.id, passage]]) };
  const interaction = new InteractionSystem(engine);
  camera.lookAt(passage.anchor);
  camera.updateMatrixWorld(true);
  assert.equal(interaction.update(true), passage);
  assert.equal(passage.cross(), true);
  assert.equal(engine.outdoor.outside, true);
  assert.equal(engine.scene.visible, false);
  collision.move(camera.position, 0, -4);
  assert.ok(camera.position.z > 15);
  camera.lookAt(passage.anchor);
  camera.updateMatrixWorld(true);
  assert.equal(interaction.update(true), passage);
  assert.equal(passage.cross(), true);
  assert.equal(engine.outdoor.outside, false);
  assert.ok(camera.position.z < 15);
  camera.position.fromArray(config.spawn);
  assert.equal(passage.cross(), false);
  assert.equal(collision.blocked(0, 15), true);
  assert.equal(collision.blocked(-9.7, 15), true);
  disposeObject3D(engine.scene);
  disposeObject3D(engine.outdoor.scene);
});

test('exterior troca a cena, carro acelera, pausa, dá ré e permite desembarque seguro', () => {
  const engine = setup(),
    outdoor = engine.outdoor;
  engine.camera.position.set(-7.4, config.eyeHeight, 16);
  outdoor.update(0);
  assert.equal(outdoor.outside, true);
  assert.equal(engine.scene.visible, false);
  assert.equal(outdoor.group.parent, outdoor.scene);
  outdoor.enterCar();
  engine.controls.keys.add('KeyW');
  const start = outdoor.car.group.position.z;
  for (let i = 0; i < 120; i++) outdoor.update(1 / 60);
  assert.ok(outdoor.car.group.position.z > start + 10);
  assert.ok(outdoor.speed > 0);
  engine.controls.active = false;
  const paused = outdoor.car.group.position.clone();
  outdoor.update(1);
  assert.deepEqual(outdoor.car.group.position, paused);
  engine.controls.active = true;
  engine.controls.keys.clear();
  engine.controls.keys.add('KeyS');
  for (let i = 0; i < 240; i++) outdoor.update(1 / 60);
  assert.ok(outdoor.speed < 0);
  assert.equal(outdoor.exitCar(), true);
  assert.equal(engine.controls.driving, false);
  assert.equal(outdoor.carCollider.enabled, true);
  assert.equal(engine.collision.blocked(engine.camera.position.x, engine.camera.position.z), false);
  engine.camera.position.set(-7.4, config.eyeHeight, 14);
  outdoor.update(0);
  assert.equal(outdoor.outside, false);
  assert.equal(engine.scene.visible, true);
  assert.equal(outdoor.group.parent, engine.scene);
  disposeObject3D(engine.scene);
  disposeObject3D(outdoor.scene);
});

test('loop externo não desenha nem atualiza os objetos internos da oficina', () => {
  const original = globalThis.document;
  globalThis.document = { hidden: false };
  const updates = [],
    renders = [];
  let tick;
  const engine = Object.assign(Object.create(Engine.prototype), {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    outdoor: { outside: true, scene: new THREE.Scene(), update() {} },
    controls: { update() {} },
    world: {
      vehicle: { update: () => updates.push('vehicle') },
      lifts: [{ advance: () => updates.push('lift') }],
    },
    registry: { items: new Map([['test', { update: () => updates.push('equipment') }]]) },
    renderer: {
      setAnimationLoop: callback => {
        tick = callback;
      },
      render: scene => renders.push(scene),
    },
    prepareReflections() {},
  });
  try {
    engine.start(() => {});
    tick(1000);
    tick(1016);
    assert.deepEqual(updates, []);
    assert.deepEqual(renders, [engine.outdoor.scene, engine.outdoor.scene]);
    engine.outdoor.outside = false;
    tick(1032);
    assert.deepEqual(updates, ['vehicle', 'lift', 'equipment']);
    assert.equal(renders[2], engine.scene);
  } finally {
    engine.loop.stop();
    globalThis.document = original;
  }
});
