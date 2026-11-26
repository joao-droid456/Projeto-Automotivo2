import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { AssemblyActivity } from '../src/education/AssemblyActivity.js';
import { Vehicle } from '../src/objects/Vehicle.js';
const definition = JSON.parse(readFileSync(new URL('../public/data/assembly.json', import.meta.url)));
const prepare = () => {
  const a = new AssemblyActivity(definition);
  a.perform('inspect'); a.select('wheel'); a.perform('mount');
  a.select('fastener'); for (let i = 0; i < 4; i++) a.perform('fit', i);
  return a;
};

test('montagem exige inspeção, peça selecionada e encaixe antes de fixação', () => {
  const a = new AssemblyActivity(definition);
  assert.equal(a.perform('mount').ok, false); assert.equal(a.mounted, false);
  a.perform('inspect'); assert.equal(a.step, 1);
  a.select('fastener'); assert.equal(a.perform('mount').ok, false);
  a.select('wheel'); assert.equal(a.perform('mount').ok, true); assert.equal(a.mounted, true);
  assert.equal(a.perform('fit', 0).ok, false); // Seleção é devolvida após encaixar a roda.
  a.select('fastener'); assert.equal(a.perform('fit', 0).ok, true);
  assert.equal(a.perform('fit', 0).ok, false); assert.equal(a.fasteners.size, 1);
});
test('ferramenta inadequada e sequência incorreta não aplicam aperto', () => {
  const a = prepare();
  assert.equal(a.step, 3); a.select('impact'); assert.equal(a.perform('configure').ok, false);
  a.select('torque'); assert.equal(a.perform('configure').ok, true);
  assert.equal(a.perform('tighten', 1).ok, false); assert.deepEqual(a.tightened, []);
  a.perform('tighten', 0); assert.equal(a.perform('tighten', 0).ok, false);
  assert.deepEqual(a.tightened, [0]);
});
test('percurso prático completo tem 12 ações e exige conferência final', () => {
  const a = prepare(); a.select('torque'); a.perform('configure');
  for (const bolt of definition.boltOrder) assert.equal(a.perform('tighten', bolt).ok, true);
  assert.equal(a.completed, false); assert.equal(a.progress, 11);
  assert.equal(a.perform('verify').completed, true); assert.equal(a.progress, 12); assert.equal(a.mistakes, 0);
  a.reset(); assert.equal(a.progress, 0); assert.equal(a.mounted, false); assert.equal(a.completed, false);
});
test('veículo separa roda e fixadores, abre capô e mantém a âncora da prática', () => {
  const v = new Vehicle();
  assert.equal(v.wheels.length, 4); assert.equal(v.bolts.length, 4);
  assert.equal(v.activeWheel, v.wheels[1]);
  assert.ok(v.hubWorld.distanceTo(v.group.localToWorld(v.homeWheelPosition.clone())) < 1e-6);
  v.setHood(true); v.update(0.1); assert.ok(v.hood.rotation.z < 0);
  const bounds = new THREE.Box3().setFromObject(v.group);
  assert.ok(bounds.min.y >= -0.01); assert.ok(bounds.max.x < 10); assert.ok(bounds.min.z > -13);
});
