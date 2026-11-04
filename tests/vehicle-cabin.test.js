import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVehicleCabin } from '../src/objects/VehicleCabin.js';
import { createVehicleInterior } from '../src/objects/VehicleInterior.js';
import { Vehicle } from '../src/objects/Vehicle.js';
import { InspectionSession } from '../src/systems/InspectionSession.js';
import { batchStaticWorld } from '../src/world/StaticBatching.js';
import { partFromHit } from '../src/vehicles/VehicleParts.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

test('faixa entre portas e janelas tem superfície nos dois lados sem frestas', () => {
  const cabin = createVehicleCabin({
    body: new THREE.MeshStandardMaterial(),
    trim: new THREE.MeshStandardMaterial(),
    glass: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
  });
  cabin.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    for (const x of [-0.8, -0.4, 0, 0.4, 0.8, 1.1]) {
      for (const y of [1.1, 1.14, 1.18, 1.19, 1.2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, side * 2), new THREE.Vector3(0, 0, -side));
        const hits = ray.intersectObject(cabin);
        assert.ok(hits.length > 0, `Fresta em x=${x}, y=${y}, lado=${side}`);
        assert.ok(hits[0].point.z * side > 0.7, 'A superfície próxima precisa fechar a lateral');
      }
    }
  }
  assert.equal(cabin.children.length, 3, 'Cabine limitada a um lote por material');
});

test('interior tem peças identificadas em um único desenho e dimensões dentro da cabine', () => {
  const interior = createVehicleInterior();
  const mesh = interior.children[0];
  assert.equal(interior.children.length, 1);
  const ids = new Set(mesh.userData.inspectionFaces.map(range => range.id));
  for (const id of [
    'front-seat',
    'rear-seat',
    'steering-wheel',
    'dashboard',
    'instrument-panel',
    'pedals',
    'door-trim',
    'gear-lever',
  ]) {
    assert.ok(ids.has(id), id);
    const range = mesh.userData.inspectionFaces.find(range => range.id === id);
    const part = partFromHit({ object: mesh, faceIndex: range.start, point: new THREE.Vector3() }, interior);
    assert.equal(part.id, id);
    assert.ok(part.description.length > 30);
  }
  const bounds = new THREE.Box3().setFromObject(interior);
  assert.ok(bounds.min.y > 0.65 && bounds.max.y < 1.69);
  assert.ok(bounds.min.z > -0.715 && bounds.max.z < 0.715);
  assert.ok(mesh.geometry.attributes.color);
  disposeObject3D(interior);
});

for (const displayOnly of [false, true]) {
  test(`interior em corte preserva a cabine após batching e restaura visibilidade (${displayOnly ? 'elevador' : 'principal'})`, () => {
    const vehicle = new Vehicle([0, 0, 0], { displayOnly, serviceable: displayOnly });
    batchStaticWorld(vehicle.group);
    assert.equal(vehicle.interior.parent, vehicle.group);
    assert.equal(vehicle.interior.children.length, 1);
    const shell = [];
    vehicle.group.traverse(o => {
      if (o.isMesh && o.parent !== vehicle.interior) shell.push(o);
    });
    shell[0].visible = false;
    const initial = shell.map(o => o.visible);
    const camera = new THREE.PerspectiveCamera(45, 1.4, 0.01, 100);
    const session = Object.assign(Object.create(InspectionSession.prototype), {
      active: true,
      borrowed: { root: vehicle.group },
      container: vehicle.group,
      interiorRoot: vehicle.interior,
      camera,
      orbit: { target: new THREE.Vector3(), update() {} },
      panel: { part() {}, status() {}, interiorView() {} },
    });
    session.toggleInterior();
    assert.ok(shell.every(o => !o.visible));
    assert.ok(vehicle.interior.children.every(o => o.visible));
    assert.ok(camera.position.toArray().every(Number.isFinite));
    session.toggleInterior();
    assert.deepEqual(
      shell.map(o => o.visible),
      initial,
    );
    assert.equal(session.hiddenExterior, null);
    disposeObject3D(vehicle.group);
  });
}
