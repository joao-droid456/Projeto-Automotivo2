import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Vehicle } from '../src/objects/Vehicle.js';
import { batchStaticWorld } from '../src/world/StaticBatching.js';
import { VEHICLE_PARTS, partFromHit, classifyVehiclePoint } from '../src/vehicles/VehicleParts.js';
import { InspectionWorkbench } from '../src/systems/InspectionWorkbench.js';
import { InspectionSession } from '../src/systems/InspectionSession.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

const definition = JSON.parse(readFileSync(new URL('../public/data/assembly.json', import.meta.url)));

test('hover diferencia pneu, banda, aro, calota central e fixadores nas superfícies reais da roda', () => {
  const vehicle = new Vehicle([0, 0, 0]);
  vehicle.group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const cases = [
    [0.32, 0, 'tire'],
    [0, 0.394, 'tire-tread'],
    [0.21, 0.05, 'wheel-rim'],
    [0, 0, 'wheel-center-cap'],
    [0, 0.105, 'wheel-fastener'],
  ];
  for (const [x, y, expected] of cases) {
    raycaster.set(new THREE.Vector3(-1.24 + x, 0.4 + y, 2), new THREE.Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(vehicle.activeWheel, true)[0];
    assert.ok(hit, expected);
    const identified = partFromHit(hit, vehicle.group, true);
    assert.equal(identified.id, expected);
    assert.equal(identified.actionId, 'front-wheel-left');
    assert.ok(identified.description.length > 40);
  }
  disposeObject3D(vehicle.group);
});

test('identificação detalhada da roda permanece após batching e mantém a opção da prática', () => {
  const vehicle = new Vehicle([0, 0, 0], { displayOnly: true, serviceable: true });
  batchStaticWorld(vehicle.group);
  vehicle.group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (const [x, expected] of [
    [0.32, 'tire'],
    [0, 'wheel-center-cap'],
  ]) {
    raycaster.set(new THREE.Vector3(-1.24 + x, 0.4, 2), new THREE.Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(vehicle.group, true)[0];
    const identified = partFromHit(hit, vehicle.group, true);
    assert.equal(identified.id, expected);
    assert.equal(identified.actionId, 'front-wheel-left');
  }
  let actions,
    restored = 0;
  const session = Object.assign(Object.create(InspectionSession.prototype), {
    selectedPart: { id: 'tire', actionId: 'front-wheel-left' },
    assemblyDefinition: definition,
    workbench: {
      vehicle: {
        filter: {},
        wheelStations: new Map(
          ['front-wheel-left', 'front-wheel-right', 'rear-wheel-left', 'rear-wheel-right'].map(id => [
            id,
            {},
          ]),
        ),
      },
      restore() {
        restored++;
      },
    },
    panel: {
      part(_part, available) {
        actions = available;
      },
    },
  });
  session.selectPart({ id: 'wheel-rim', actionId: 'front-wheel-left' });
  assert.equal(restored, 0);
  assert.ok(actions.some(action => action.id === 'start-wheel'));
  for (const actionId of ['front-wheel-right', 'rear-wheel-left', 'rear-wheel-right']) {
    session.selectPart({ id: 'wheel-rim', actionId });
    assert.ok(
      actions.some(action => action.id === 'start-wheel'),
      actionId,
    );
  }
  disposeObject3D(vehicle.group);
});

test('identificação por superfície diferencia portas, rodas, vidros e extremidades', () => {
  const cases = [
    [[-1.24, 0.4, 0.9], 'front-wheel-left'],
    [[1.21, 0.4, -0.9], 'rear-wheel-right'],
    [[-0.2, 0.95, 0.84], 'front-door-left'],
    [[0.8, 0.95, -0.84], 'rear-door-right'],
    [[0, 1.7, 0], 'roof'],
    [[0, 1.4, 0.7], 'glass'],
    [[-2, 0.9, 0.5], 'lights'],
    [[-2, 0.6, 0], 'front-bumper'],
    [[1.5, 1.1, 0], 'trunk'],
  ];
  for (const [position, expected] of cases) {
    assert.equal(classifyVehiclePoint(new THREE.Vector3(...position)), expected);
    assert.ok(VEHICLE_PARTS[expected].description);
  }
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.material.userData.inspectionPart = 'glass';
  root.add(mesh);
  assert.equal(partFromHit({ object: mesh, point: new THREE.Vector3(0, 1.62, 0.7) }, root, true).id, 'glass');
  assert.equal(
    partFromHit({ object: mesh, point: new THREE.Vector3(-0.68, 1.23, 0.91) }, root, true).id,
    'mirror',
  );
  disposeObject3D(root);
});

test('lotes instanciados mantêm a identificação de cada peça sem separar desenhos', () => {
  const root = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshStandardMaterial();
  const ids = ['hood', 'battery', 'filter'];
  ids.forEach((id, index) => {
    const group = new THREE.Group();
    group.userData.inspectionPart = id;
    root.add(group);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = index * 2;
    mesh.userData.static = true;
    group.add(mesh);
  });
  batchStaticWorld(root);
  const batch = root.children.find(object => object.isInstancedMesh);
  assert.equal(batch.count, 3);
  ids.forEach((id, instanceId) =>
    assert.equal(partFromHit({ object: batch, instanceId, point: new THREE.Vector3() }, root).id, id),
  );
  disposeObject3D(root);
});

test('geometrias combinadas mantêm faixas de triângulos por componente', () => {
  const root = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  const ids = ['engine', 'exhaust', 'oilPan'];
  ids.forEach((id, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(index + 1, 1, 1), material);
    mesh.userData.static = true;
    mesh.userData.inspectionPart = id;
    root.add(mesh);
  });
  batchStaticWorld(root);
  const batch = root.children.find(object => object.isMesh);
  assert.equal(root.children.length, 1);
  batch.userData.inspectionFaces.forEach((range, index) => {
    assert.equal(
      partFromHit({ object: batch, faceIndex: range.start, point: new THREE.Vector3() }, root).id,
      ids[index],
    );
  });
  disposeObject3D(root);
});

test('veículo procedural identifica peças reais e conserva cárter, suspensão e escapamento nos lotes inferiores', () => {
  const vehicle = new Vehicle();
  assert.equal(vehicle.hood.userData.inspectionPart, 'hood');
  assert.equal(vehicle.battery.userData.inspectionPart, 'battery');
  assert.equal(vehicle.activeWheel.userData.inspectionPart, 'front-wheel-left');
  const ids = new Set();
  vehicle.undercarriage.traverse(object =>
    object.userData.inspectionFaces?.forEach(range => ids.add(range.id)),
  );
  for (const id of ['oilPan', 'exhaust', 'suspension', 'transmission']) assert.ok(ids.has(id), id);
  disposeObject3D(vehicle.group);
});

test('montagem na janela reutiliza pré-requisitos, rejeita sequência errada e salva somente na conclusão', () => {
  const vehicle = new Vehicle(),
    saved = [];
  const work = new InspectionWorkbench(vehicle, definition, { complete: (...args) => saved.push(args) });
  work.start('wheel');
  assert.equal(vehicle.activeWheel.visible, false);
  assert.equal(work.perform('mount').ok, false);
  work.perform('inspect');
  work.perform('mount');
  assert.equal(vehicle.activeWheel.visible, true);
  for (let i = 0; i < 4; i++) work.perform(`fit-${i}`);
  work.perform('configure');
  assert.equal(work.perform('tighten-1').ok, false);
  assert.equal(saved.length, 0);
  for (const i of definition.boltOrder) assert.equal(work.perform(`tighten-${i}`).ok, true);
  assert.equal(saved.length, 0);
  work.perform('verify');
  assert.equal(saved[0][0], definition.id);
  assert.equal(work.perform('verify').ok, false);
  work.restore();
  assert.equal(vehicle.activeWheel.visible, true);
  assert.ok(vehicle.bolts.every(bolt => bolt.visible));
  disposeObject3D(vehicle.group);
});

test('filtro, bateria e luzes têm ações próprias, estados visuais e restauração da prática', () => {
  const vehicle = new Vehicle(),
    saved = [];
  const work = new InspectionWorkbench(vehicle, definition, { complete: (...args) => saved.push(args) });
  const color = vehicle.filter.material.color.clone();
  assert.equal(work.start('invalid'), false);
  work.start('filter');
  assert.equal(vehicle.hoodOpen, true);
  work.perform('cover');
  assert.equal(vehicle.filterCoverLift, 0.45);
  work.perform('filter');
  assert.equal(vehicle.filter.visible, false);
  work.perform('filter');
  work.perform('cover');
  assert.equal(saved[0][0], 'servico-filter');
  work.restore();
  assert.ok(vehicle.filter.material.color.equals(color));
  assert.equal(vehicle.hoodOpen, false);
  work.start('battery');
  const terminal = vehicle.terminals[1].material.color.clone();
  work.perform('positive');
  assert.equal(vehicle.terminals[1].material.color.equals(terminal), false);
  work.perform('negative');
  work.perform('meter');
  assert.match(work.instruction, /12,6 V/);
  work.restore();
  work.start('lights');
  work.perform('headlights');
  assert.equal(vehicle.lightsOn, true);
  work.perform('hazards');
  assert.equal(vehicle.hazardsOn, true);
  work.perform('off');
  assert.equal(vehicle.lightsOn, false);
  work.restore();
  assert.equal(saved.length, 3);
  disposeObject3D(vehicle.group);
});

test('trocar ou sair de uma prática incompleta restaura apenas suas alterações transitórias', () => {
  const vehicle = new Vehicle();
  vehicle.setHood(true);
  vehicle.lightsOn = true;
  const work = new InspectionWorkbench(vehicle, definition, {
    complete() {
      assert.fail('Não deveria salvar');
    },
  });
  work.start('wheel');
  work.perform('inspect');
  work.start('filter');
  assert.equal(vehicle.activeWheel.visible, true);
  work.perform('cover');
  work.restore();
  work.restore();
  assert.equal(vehicle.hoodOpen, true);
  assert.equal(vehicle.lightsOn, true);
  assert.equal(vehicle.filterCoverLift, 0);
  const lowDetail = new Vehicle([0, 0, 0], { displayOnly: true, serviceable: true });
  assert.equal(new InspectionWorkbench(lowDetail, definition).start('filter'), false);
  disposeObject3D(vehicle.group);
  disposeObject3D(lowDetail.group);
});
