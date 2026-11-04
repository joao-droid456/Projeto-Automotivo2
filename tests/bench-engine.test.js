import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BenchEngine, engineParts } from '../src/objects/BenchEngine.js';
import { InspectionModel } from '../src/vehicles/InspectionModel.js';
import { batchStaticWorld } from '../src/world/StaticBatching.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

const bench = { position: [5.65, 0, -2.4], size: [2.8, 0.93, 1.1] };

test('motor mantém peças selecionáveis após batching e restaura a bancada após inspeção aberta', () => {
  const item = new BenchEngine(bench);
  const world = new THREE.Group();
  world.add(item.group);
  batchStaticWorld(world);
  assert.equal(item.parts.size, Object.keys(engineParts).length);
  for (const [id, meshes] of item.parts) {
    assert.ok(meshes.length > 0);
    assert.ok(meshes.every(mesh => mesh.userData.enginePart === id && world.getObjectById(mesh.id)));
  }
  const initial = item.group.position.clone();
  const borrowed = new InspectionModel(item.group, new THREE.Group());
  item.setExplosion(1);
  assert.ok(item.head.position.y > 1.4);
  assert.ok(item.frontWall.position.z > 0.8);
  assert.ok(item.liners.every(mesh => !mesh.visible));
  item.setExplosion(0);
  borrowed.restore();
  assert.equal(item.group.parent, world);
  assert.deepEqual(item.group.position, initial);
  assert.ok(item.liners.every(mesh => mesh.visible));
  assert.equal(item.head.position.y, 0.81);
  disposeObject3D(world);
  item.outline.geometry.dispose();
  item.outline.material.dispose();
});

test('bielas preservam comprimento e seguem pistões; pares de pistões mantêm a fase', () => {
  const item = new BenchEngine(bench);
  const positions = [];
  for (let i = 0; i < 120; i++) {
    item.advance(1 / 30, true);
    positions.push(item.moving[0].piston.position.y);
    assert.equal(item.moving[0].piston.position.y, item.moving[3].piston.position.y);
    assert.equal(item.moving[1].piston.position.y, item.moving[2].piston.position.y);
    for (const { piston, rod } of item.moving) {
      assert.ok(Math.abs(rod.scale.y - 0.29) < 1e-10);
      const end = new THREE.Vector3(0, rod.scale.y / 2, 0).applyQuaternion(rod.quaternion).add(rod.position);
      assert.ok(end.distanceTo(piston.position) < 1e-10);
    }
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) > 0.14);
  const frozen = item.moving[0].piston.position.clone();
  item.advance(1, false);
  assert.deepEqual(item.moving[0].piston.position, frozen);
  // Highlighting one part must not recolor unrelated components.
  assert.notEqual(item.head.material, item.moving[0].piston.material);
  disposeObject3D(item.group);
  item.outline.geometry.dispose();
  item.outline.material.dispose();
});
