import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Engine } from '../src/core/Engine.js';
import { createWorkshop } from '../src/world/Workshop.js';
import { CollisionSystem } from '../src/core/CollisionSystem.js';
import { collectInspectableVehicles } from '../src/vehicles/InspectableVehicles.js';
import { InspectionModel, frameInspectionModel } from '../src/vehicles/InspectionModel.js';
import { InspectionSession } from '../src/systems/InspectionSession.js';
import { InspectionAssetLoader } from '../src/vehicles/InspectionAssetLoader.js';
import { VehicleSelection, vehicleFromHits } from '../src/systems/VehicleSelection.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

function model() {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), new THREE.MeshStandardMaterial()));
  return root;
}

function fixture(options) {
  const scene = new THREE.Scene(),
    root = model();
  scene.add(root);
  const engine = {
    scene,
    camera: new THREE.PerspectiveCamera(65, 1.4),
    renderer: { domElement: {} },
    controls: { stop() {} },
    setActiveView: Engine.prototype.setActiveView,
    clearActiveView: Engine.prototype.clearActiveView,
  };
  const panel = {
    messages: [],
    show() {},
    hide() {},
    dispose() {},
    status(message) {
      this.messages.push(message);
    },
  };
  const orbit = {
    target: new THREE.Vector3(),
    update() {},
    disposeCount: 0,
    dispose() {
      this.disposeCount++;
    },
  };
  let exits = 0;
  const session = new InspectionSession(engine, panel, () => exits++, {
    createOrbit: () => orbit,
    ...options,
  });
  return { engine, root, panel, orbit, session, exits: () => exits };
}

test('catálogo inclui carro didático, todos os elevadores, cobertos e frota opcional sem duplicar malhas', () => {
  const config = JSON.parse(readFileSync(new URL('../public/data/workshop.json', import.meta.url)));
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
        fillRect() {},
        fillText() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
      }),
    }),
  };
  const scene = new THREE.Scene();
  try {
    const world = createWorkshop(scene, new CollisionSystem(config.playerRadius), config);
    const fleetRoot = model();
    const engine = {
      world,
      config,
      fleet: { inspectionVehicles: [{ id: 'fleet', name: 'LOD0', root: fleetRoot }] },
    };
    const vehicles = collectInspectableVehicles(engine);
    assert.equal(vehicles.length, 2 + world.lifts.length + config.reconstruction.coveredCars.length);
    assert.equal(new Set(vehicles.map(vehicle => vehicle.id)).size, vehicles.length);
    for (const vehicle of vehicles) {
      const parent = vehicle.root.parent || scene;
      if (!vehicle.root.parent) parent.add(vehicle.root);
      const inspection = new InspectionModel(vehicle.root, new THREE.Group());
      assert.equal(inspection.root, vehicle.root);
      inspection.restore();
      assert.equal(vehicle.root.parent, parent);
    }
  } finally {
    globalThis.document = original;
    disposeObject3D(scene);
  }
});

test('empréstimo preserva pai, ordem, transformações, materiais e estado mecânico dos filhos', () => {
  const parent = new THREE.Group(),
    container = new THREE.Group(),
    root = model();
  const before = new THREE.Group(),
    after = new THREE.Group();
  parent.position.set(3, 1.8, 8);
  parent.rotation.y = 0.7;
  root.position.set(1, 2, 3);
  root.rotation.set(0.1, 0.3, 0.2);
  root.scale.set(1.2, 1.1, 0.9);
  root.children[0].rotation.z = -0.8;
  parent.add(before, root, after);
  const transform = [root.position.clone(), root.quaternion.clone(), root.scale.clone()];
  const material = root.children[0].material;
  let disposed = 0;
  material.addEventListener('dispose', () => disposed++);
  const borrowed = new InspectionModel(root, container);
  root.children[0].userData.inspectionState = 'preserved';
  borrowed.restore();
  borrowed.restore();
  assert.deepEqual(parent.children, [before, root, after]);
  assert.ok(
    root.position.equals(transform[0]) &&
      root.quaternion.equals(transform[1]) &&
      root.scale.equals(transform[2]),
  );
  assert.equal(root.children[0].rotation.z, -0.8);
  assert.equal(root.children[0].userData.inspectionState, 'preserved');
  assert.equal(root.children[0].material, material);
  assert.equal(disposed, 0);
  disposeObject3D(parent);
});

test('enquadramento suporta tela estreita, zoom próximo e vista inferior sem deformar o modelo', () => {
  const root = model(),
    container = new THREE.Group();
  container.add(root);
  const camera = new THREE.PerspectiveCamera(45, 0.5);
  const orbit = {
    target: new THREE.Vector3(),
    update() {
      camera.lookAt(this.target);
    },
  };
  frameInspectionModel(container, camera, orbit);
  assert.ok(camera.position.length() > 5);
  assert.ok(orbit.minDistance < 1 && orbit.maxDistance > camera.position.length());
  assert.ok(camera.near > 0 && camera.far > 100);
  assert.ok(root.scale.equals(new THREE.Vector3(1, 1, 1)));
  assert.throws(() => frameInspectionModel(new THREE.Group(), camera, orbit), /geometria/);
  disposeObject3D(root);
});

test('loop renderiza uma única cena e congela todas as atualizações da oficina na inspeção', () => {
  const original = globalThis.document;
  globalThis.document = { hidden: false };
  const renders = [],
    updates = [];
  let tick;
  const engine = Object.assign(Object.create(Engine.prototype), {
    renderer: {
      setAnimationLoop(callback) {
        tick = callback;
      },
      render: (scene, camera) => renders.push([scene, camera]),
    },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    controls: { update: () => updates.push('controls') },
    outdoor: { outside: false, update() {} },
    world: {
      vehicle: { update: () => updates.push('vehicle') },
      lifts: [{ advance: () => updates.push('lift') }],
    },
    registry: { items: new Map() },
    prepareReflections() {},
  });
  try {
    engine.start(() => updates.push('activities'));
    const view = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      update: () => updates.push('inspection'),
    };
    engine.setActiveView(view);
    assert.throws(() => engine.setActiveView(view), /exclusiva/);
    tick(1000);
    tick(1016);
    assert.deepEqual(updates, ['inspection', 'inspection']);
    assert.equal(renders.length, 2);
    assert.equal(renders[0][0], view.scene);
    engine.clearActiveView({});
    assert.equal(engine.activeView, view);
    engine.clearActiveView(view);
    tick(1032);
    assert.deepEqual(updates.slice(2), ['controls', 'vehicle', 'lift', 'activities']);
    assert.equal(renders[2][0], engine.scene);
  } finally {
    engine.loop.stop();
    globalThis.document = original;
  }
});

test('seleção respeita oclusão, visibilidade e identificação de grupos/LOD', () => {
  const root = model(),
    hidden = model(),
    wall = model();
  hidden.visible = false;
  const vehicle = { root, id: 'test' };
  const hit = object => ({ object });
  assert.equal(vehicleFromHits([hit(root.children[0])], [vehicle]), vehicle);
  assert.equal(vehicleFromHits([hit(wall.children[0]), hit(root.children[0])], [vehicle]), null);
  assert.equal(vehicleFromHits([hit(hidden.children[0]), hit(root.children[0])], [vehicle]), vehicle);
  const lod = new THREE.LOD();
  lod.addLevel(root, 0);
  lod.addLevel(model(), 12);
  const descriptor = { root, pickRoot: lod };
  assert.equal(vehicleFromHits([hit(lod.levels[1].object.children[0])], [descriptor]), descriptor);
  disposeObject3D(lod);
  disposeObject3D(hidden);
  disposeObject3D(wall);
});

test('clique seleciona mas arrastar, estado desabilitado e eventos após dispose não selecionam', () => {
  const original = globalThis.document;
  globalThis.document = { pointerLockElement: null };
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const scene = new THREE.Scene(),
    root = model(),
    camera = new THREE.PerspectiveCamera();
  scene.add(root);
  camera.position.z = 8;
  camera.lookAt(0, 0, 0);
  let count = 0,
    enabled = true;
  const selection = new VehicleSelection(
    { renderer: { domElement: canvas }, scene, camera },
    [{ root }],
    () => count++,
    () => enabled,
  );
  const emit = (type, x = 50) => {
    const event = new globalThis.Event(type);
    Object.assign(event, { clientX: x, clientY: 50, button: 0, pointerId: 1, isPrimary: true });
    canvas.dispatchEvent(event);
  };
  try {
    emit('pointerdown');
    emit('pointerup');
    assert.equal(count, 1);
    emit('pointerdown');
    emit('pointerup', 80);
    assert.equal(count, 1);
    emit('pointerdown');
    emit('pointermove', 80);
    emit('pointerup');
    assert.equal(count, 1);
    enabled = false;
    emit('pointerdown');
    emit('pointerup');
    assert.equal(count, 1);
    enabled = true;
    selection.dispose();
    emit('pointerdown');
    emit('pointerup');
    assert.equal(count, 1);
  } finally {
    selection.dispose();
    globalThis.document = original;
    disposeObject3D(root);
  }
});

test('inspeção sem detalhe não carrega recursos e restaura o mesmo carro ao sair repetidamente', async () => {
  let loads = 0;
  const f = fixture({
    loadModel: async () => {
      loads++;
      return model();
    },
  });
  const initialCamera = f.engine.camera.position.clone();
  for (let i = 0; i < 3; i++) {
    assert.equal(await f.session.open({ root: f.root, name: 'Test' }), true);
    assert.equal(f.engine.activeView, f.session);
    assert.equal(f.root.parent, f.session.container);
    f.session.close();
    assert.equal(f.engine.activeView, null);
    assert.equal(f.root.parent, f.engine.scene);
  }
  assert.equal(loads, 0);
  assert.equal(f.exits(), 3);
  assert.equal(f.orbit.disposeCount, 3);
  assert.ok(f.engine.camera.position.equals(initialCamera));
  f.session.dispose();
  f.session.dispose();
  disposeObject3D(f.root);
});

test('versão detalhada é carregada somente ao abrir e descartada sem descartar o carro da oficina', async () => {
  const detail = model();
  let disposed = 0,
    originalDisposed = 0,
    loads = 0;
  detail.children[0].geometry.addEventListener('dispose', () => disposed++);
  const f = fixture({
    loadModel: async () => {
      loads++;
      return detail;
    },
  });
  f.root.children[0].geometry.addEventListener('dispose', () => originalDisposed++);
  assert.equal(loads, 0);
  await f.session.open({ root: f.root, name: 'Test', inspectionModel: '/detail.glb' });
  assert.equal(loads, 1);
  assert.equal(f.root.parent, f.engine.scene);
  assert.equal(f.session.ownedModel, detail);
  f.session.close();
  f.session.dispose();
  assert.equal(disposed, 1);
  assert.equal(originalDisposed, 0);
  disposeObject3D(f.root);
});

test('carregamento tardio não publica modelo na próxima inspeção e erro mantém fallback', async () => {
  let resolve;
  const f = fixture({
    loadModel: () =>
      new Promise(done => {
        resolve = done;
      }),
  });
  const pending = f.session.open({ root: f.root, name: 'First', inspectionModel: '/late.glb' });
  f.session.close();
  await f.session.open({ root: f.root, name: 'Second' });
  const detail = model();
  let disposed = 0;
  detail.children[0].geometry.addEventListener('dispose', () => disposed++);
  resolve(detail);
  assert.equal(await pending, false);
  assert.equal(disposed, 1);
  assert.equal(f.session.active, true);
  assert.equal(f.session.ownedModel, null);
  f.session.close();
  f.session.loadModel = async () => {
    throw new Error('missing');
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await f.session.open({ root: f.root, name: 'Test', inspectionModel: '/missing.glb' }), true);
    assert.match(f.panel.messages.at(-1), /modelo da oficina/);
    assert.equal(f.root.parent, f.session.container);
  } finally {
    console.warn = originalWarn;
    f.session.dispose();
    disposeObject3D(f.root);
  }
});

test('falha ao inicializar câmera restaura o veículo e não deixa visualização exclusiva ativa', async () => {
  const f = fixture({
    createOrbit: () => {
      throw new Error('camera failed');
    },
  });
  await assert.rejects(f.session.open({ root: f.root, name: 'Test' }), /camera failed/);
  assert.equal(f.root.parent, f.engine.scene);
  assert.equal(f.engine.activeView, undefined);
  assert.equal(f.session.active, false);
  f.session.dispose();
  disposeObject3D(f.root);
});

test('loader detalhado usa parser existente, resolve caminhos e aborta antes de decodificar', async () => {
  const originalDocument = globalThis.document,
    originalFetch = globalThis.fetch;
  globalThis.document = { baseURI: 'https://example.test/simulator/' };
  let requestURL,
    parses = 0;
  const root = model();
  const assets = new InspectionAssetLoader(
    {
      fleet: {
        loader: {
          parseAsync: async () => {
            parses++;
            return { scene: root };
          },
        },
      },
    },
    '/simulator/',
  );
  globalThis.fetch = async (url, { signal }) => {
    requestURL = String(url);
    signal.throwIfAborted();
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  try {
    const abort = new AbortController();
    assert.equal(await assets.load('models/detail.glb', abort.signal), root);
    assert.equal(requestURL, 'https://example.test/simulator/models/detail.glb');
    abort.abort();
    await assert.rejects(assets.load('models/detail.glb', abort.signal), { name: 'AbortError' });
    assert.equal(parses, 1);
  } finally {
    assets.dispose();
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    disposeObject3D(root);
  }
});
