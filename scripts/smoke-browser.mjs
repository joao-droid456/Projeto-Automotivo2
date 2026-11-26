// Connects to a separate Chromium test profile; does not launch or install a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BoxGeometry } from 'three';

// Small self-contained GLB fixture exercises the real lazy parser without adding a production model.
async function writeDetailFixture() {
  const geometry = new BoxGeometry(4, 1.5, 2).toNonIndexed();
  const positions = geometry.attributes.position.array;
  const binary = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteLength: binary.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-2, -0.75, -1],
        max: [2, 0.75, 1],
      },
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(padded.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  await mkdir('.browser-refactor', { recursive: true });
  await writeFile(
    '.browser-refactor/inspection-detail.glb',
    Buffer.concat([header, jsonHeader, padded, binHeader, binary]),
  );
  geometry.dispose();
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5175';
const debugURL = process.env.SMOKE_DEBUG_URL || 'http://127.0.0.1:9225';
const pages = await (await fetch(`${debugURL}/json`)).json();
const page = pages.find(candidate => candidate.type === 'page');
assert.ok(page, 'Abra um Chromium com remote-debugging em um perfil de teste separado.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const pending = new Map(),
  errors = [],
  warnings = [],
  failedRequests = [];
let sequence = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  else if (message.method === 'Runtime.consoleAPICalled') {
    const entry = message.params;
    if (entry.type === 'error') errors.push(entry);
    if (entry.type === 'warning') warnings.push(entry);
  } else if (message.method === 'Network.loadingFailed' && !message.params.canceled)
    failedRequests.push(message.params);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Condição não atendida: ${expression}`);
}

const report = { baseURL, checks: [], errors, warnings, failedRequests, fpsMeasured: false };
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: baseURL });
  await waitFor(
    "document.querySelector('#home') && !document.querySelector('#home').classList.contains('hidden')",
  );
  assert.equal(await evaluate("document.querySelector('#error').classList.contains('hidden')"), true);
  report.checks.push('Entrada real inicializa e apresenta menu sem tela de erro');
  await evaluate("document.querySelector('#activities').click()");
  assert.equal(await evaluate("Boolean(document.querySelector('#start-oil-tour'))"), true);
  await evaluate(
    "document.querySelector('#activities-close').click(); document.querySelector('#practice').click()",
  );
  await waitFor("!document.querySelector('.vehicle-inspection').classList.contains('hidden')");
  report.checks.push('Percursos e práticas do carro acessíveis pela interface real');

  // Use the actual touch surface to aim at the practice car, click it and exercise the menu.
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await send('Page.navigate', { url: baseURL });
  await waitFor(
    "document.querySelector('#home') && !document.querySelector('#home').classList.contains('hidden')",
  );
  assert.equal(await evaluate("matchMedia('(pointer: coarse)').matches"), true);
  await send('Runtime.evaluate', {
    expression: "document.querySelector('#enter').click()",
    userGesture: true,
  });
  const config = await (await fetch(`${baseURL}/data/workshop.json`)).json();
  const [vx, , vz] = config.reconstruction.vehicle;
  const [sx, sy, sz] = config.spawn;
  const yaw = Math.atan2(-(vx - sx), -(vz - sz));
  const pitch = Math.atan2(0.9 - sy, Math.hypot(vx - sx, vz - sz));
  const center = await evaluate('({ x: innerWidth / 2, y: innerHeight / 2 })');
  const dx = -(yaw - config.spawnYaw) / (0.0022 * 1.4),
    dy = -pitch / (0.0022 * 1.4);
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 65);
  for (let i = 0; i < steps; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x + dx / steps, y: center.y + dy / steps, id: 1 }],
    });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor("!document.querySelector('.vehicle-inspection').classList.contains('hidden')");
  assert.equal(
    await evaluate(
      "document.querySelector('.inspection-window').getAttribute('role') === 'dialog' || document.querySelector('.vehicle-inspection').getAttribute('role') === 'dialog'",
    ),
    true,
  );
  await evaluate("document.querySelector('.vehicle-inspection [data-back]').click()");
  report.checks.push('Toque no carro abre diretamente a janela e retorna na entrada real');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  await send('Page.navigate', { url: `${baseURL}/tests/browser-harness.html` });
  await waitFor('Boolean(window.smoke)');
  report.integration = await evaluate(`(() => {
    const { engine, station, interaction, oil } = smoke;
    engine.loop.stop();
    const vehicle = engine.world.vehicle;
    const start = engine.camera.position.clone();
    engine.controls.active = true; engine.controls.keys.add('KeyW');
    for (let i = 0; i < 30; i++) engine.controls.update(1 / 60);
    const moved = engine.camera.position.distanceTo(start) > 0.1;
    engine.controls.stop();
    const lift = station.lift;
    engine.camera.position.copy(lift.anchor); engine.camera.position.x -= 1.5; engine.camera.position.z += 0.2;
    engine.camera.lookAt(lift.anchor); engine.camera.updateMatrixWorld();
    const selectedLift = interaction.update(true)?.data.id === lift.data.id;
    lift.activate(); lift.advance(4); station.update();
    const raised = lift.height === lift.maxHeight && !lift.moving;
    engine.camera.position.copy(station.anchor); engine.camera.position.y = 1.65;
    const oilOpened = oil.open(station);
    const lock = !lift.activate();
    oil.close();
    engine.camera.position.set(0, 1.65, 0);
    const lowered = lift.activate(); lift.advance(4);
    engine.renderer.render(engine.scene, engine.camera);
    return { moved, selectedLift, raised, oilOpened, lock, lowered: lowered && lift.height === 0,
      cars: engine.world.lifts.length + Number(Boolean(vehicle.group)),
      calls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles,
      geometries: engine.renderer.info.memory.geometries, textures: engine.renderer.info.memory.textures,
      webgl: engine.renderer.getContext().getParameter(engine.renderer.getContext().VERSION) };
  })()`);
  for (const key of ['moved', 'selectedLift', 'raised', 'oilOpened', 'lock', 'lowered'])
    assert.equal(report.integration[key], true, key);
  assert.ok(report.integration.calls > 0);
  report.checks.push(
    'WebGL renderiza oficina e carros; movimento, seleção, ciclo do elevador, câmeras e sessões funcionam',
  );
  await mkdir('.browser-refactor', { recursive: true });
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-refactor/workshop.png', Buffer.from(screenshot.data, 'base64'));
  await writeDetailFixture();
  report.inspection = await evaluate(`(async () => {
    const { engine, inspection, vehicles, selection, THREE } = smoke;
    const result = { vehicles: [], workshopFrames: 0, inspectionFrames: 0, transitionSnapshots: 0 };
    // The fixture loop is stopped; step the same production callback deterministically.
    engine.loop.running = true;
    const originalRender = engine.renderer.render.bind(engine.renderer);
    engine.renderer.render = (scene, camera) => {
      if (scene === engine.scene) { if (engine.activeView) result.workshopFrames++; else result.transitionSnapshots++; } else result.inspectionFrames++;
      return originalRender(scene, camera);
    };
    const playerPosition = engine.camera.position.clone();
    const playerQuaternion = engine.camera.quaternion.clone();
    const lift = engine.world.lifts[0];
    lift.canLower = null; lift.activate(); lift.advance(1);
    const liftHeight = lift.height, liftElapsed = lift.elapsed;
    for (const vehicle of vehicles) {
      const root = vehicle.root, parent = root.parent, index = parent.children.indexOf(root);
      const position = root.position.clone(), quaternion = root.quaternion.clone();
      const bounds = new THREE.Box3().setFromObject(root), center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      let picked = false;
      for (const offset of [[size.x/2+0.6,0,0],[-size.x/2-0.6,0,0],[0,0,size.z/2+0.6],[0,0,-size.z/2-0.6]]) {
        engine.camera.position.copy(center).add(new THREE.Vector3(...offset));
        engine.camera.lookAt(center); engine.camera.updateMatrixWorld(true);
        const rect = engine.renderer.domElement.getBoundingClientRect();
        if (selection.pick(rect.left+rect.width/2, rect.top+rect.height/2)?.id === vehicle.id) { picked = true; break; }
      }
      const workshopCameraPosition = engine.camera.position.clone(), workshopCameraQuaternion = engine.camera.quaternion.clone();
      const opened = await inspection.open(vehicle);
      engine.loop.tick(3000); engine.loop.tick(3016);
      const isolated = root.parent === inspection.container && engine.activeView === inspection;
      inspection.close();
      result.vehicles.push({ id: vehicle.id, picked, opened, isolated,
        cameraPreserved: engine.camera.position.equals(workshopCameraPosition) && engine.camera.quaternion.equals(workshopCameraQuaternion),
        restored: root.parent === parent && parent.children.indexOf(root) === index && root.position.equals(position) && root.quaternion.equals(quaternion) });
    }
    const vehicle = vehicles[0];
    await inspection.open(vehicle);
    window.inspectionCameraBefore = inspection.camera.position.toArray();
    window.inspectionTargetBefore = inspection.orbit.target.toArray();
    window.inspectionDistanceBefore = inspection.camera.position.distanceTo(inspection.orbit.target);
    result.liftFrozen = lift.height === liftHeight && lift.elapsed === liftElapsed;
    engine.camera.position.copy(playerPosition); engine.camera.quaternion.copy(playerQuaternion);
    result.mainCameraPreserved = result.vehicles.every(vehicle => vehicle.cameraPreserved);
    engine.loop.running = false;
    return result;
  })()`);
  for (const vehicle of report.inspection.vehicles) {
    for (const key of ['picked', 'opened', 'isolated', 'restored', 'cameraPreserved'])
      assert.equal(vehicle[key], true, `${vehicle.id}: ${key}`);
  }
  assert.equal(report.inspection.workshopFrames, 0);
  assert.ok(report.inspection.inspectionFrames > 0);
  assert.equal(report.inspection.liftFrozen, true);

  report.inspection.modal = await evaluate(`(() => {
    const dialog = document.querySelector('.vehicle-inspection');
    return { canvasInside: Boolean(dialog.querySelector('.inspection-canvas canvas')),
      frozenBackground: dialog.querySelector('.inspection-background').naturalWidth > 0,
      centeredWindow: dialog.querySelector('.inspection-window').getBoundingClientRect().width < innerWidth };
  })()`);
  for (const value of Object.values(report.inspection.modal)) assert.equal(value, true);

  // Real OrbitControls input: rotate, zoom and pan using Chromium mouse events.
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 350,
    y: 260,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 430, y: 290, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 430,
    y: 290,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: -120 });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 350,
    y: 260,
    button: 'right',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 390, y: 280, button: 'right', buttons: 2 });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 390,
    y: 280,
    button: 'right',
    clickCount: 1,
  });
  const cameraResult = await evaluate(`(() => {
    const { engine, inspection } = smoke;
    for (let i = 0; i < 12; i++) inspection.update(1/60);
    engine.renderer.render(inspection.scene, inspection.camera);
    return { cameraMoved: JSON.stringify(inspection.camera.position.toArray()) !== JSON.stringify(inspectionCameraBefore),
      targetMoved: JSON.stringify(inspection.orbit.target.toArray()) !== JSON.stringify(inspectionTargetBefore),
      zoomed: inspection.camera.position.distanceTo(inspection.orbit.target) < inspectionDistanceBefore,
      distance: inspection.camera.position.distanceTo(inspection.orbit.target) };
  })()`);
  assert.equal(cameraResult.cameraMoved, true);
  assert.equal(cameraResult.zoomed, true);
  assert.equal(cameraResult.targetMoved, true);
  report.inspection.camera = cameraResult;
  const inspectionShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-refactor/inspection.png', Buffer.from(inspectionShot.data, 'base64'));

  // Project real component meshes, then use actual pointer events to hover/click them.
  const hoodPoint = await evaluate(`(() => {
    const { engine, inspection, THREE } = smoke;
    inspection.orbit.enableDamping = false;
    inspection.orbit.target.set(0, 0, 0); inspection.camera.position.set(-6, 3.5, 6); inspection.orbit.update();
    inspection.camera.updateMatrixWorld(true);
    engine.renderer.render(inspection.scene, inspection.camera);
    const hood = engine.world.vehicle.hood;
    hood.updateWorldMatrix(true, true);
    const point = new THREE.Box3().setFromObject(hood).getCenter(new THREE.Vector3()).project(inspection.camera);
    const rect = engine.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x+1)/2*rect.width, y: rect.top+(1-point.y)/2*rect.height };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...hoodPoint });
  await evaluate('smoke.inspection.update(1/60)');
  report.parts =
    await evaluate(`({ hoverName: document.querySelector('.inspection-tooltip strong').textContent,
    hoverInfo: document.querySelector('.inspection-tooltip span').textContent,
    tooltipVisible: !document.querySelector('.inspection-tooltip').classList.contains('hidden') })`);
  assert.equal(report.parts.hoverName, 'Capô');
  assert.equal(report.parts.tooltipVisible, true);
  assert.ok(report.parts.hoverInfo.length > 20);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...hoodPoint,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...hoodPoint,
    button: 'left',
    clickCount: 1,
  });
  assert.equal(await evaluate('smoke.inspection.selectedPart?.id'), 'hood');
  await evaluate(
    "document.querySelector('[data-part-action=hood]').click(); for(let i=0;i<30;i++) smoke.inspection.update(1/60); smoke.engine.renderer.render(smoke.inspection.scene, smoke.inspection.camera)",
  );
  assert.equal(
    await evaluate(
      'smoke.engine.world.vehicle.hoodOpen && smoke.engine.world.vehicle.hood.rotation.z < -0.8',
    ),
    true,
  );
  const partShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-refactor/inspection-parts.png', Buffer.from(partShot.data, 'base64'));
  const filterPoint = await evaluate(`(() => {
    const { engine, inspection, THREE } = smoke;
    inspection.orbit.target.set(0,0,0); inspection.camera.position.set(-2,6,4); inspection.orbit.update();
    inspection.camera.updateMatrixWorld(true);
    engine.renderer.render(inspection.scene, inspection.camera);
    const box = engine.world.vehicle.airbox; box.updateWorldMatrix(true,true);
    const point = new THREE.Box3().setFromObject(box).getCenter(new THREE.Vector3()).project(inspection.camera);
    const rect = engine.renderer.domElement.getBoundingClientRect();
    return { x: rect.left+(point.x+1)/2*rect.width, y: rect.top+(1-point.y)/2*rect.height };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...filterPoint });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...filterPoint,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...filterPoint,
    button: 'left',
    clickCount: 1,
  });
  assert.equal(await evaluate('smoke.inspection.selectedPart?.id'), 'filter');
  await evaluate(
    "document.querySelector('[data-part-action=start-filter]').click(); document.querySelector('[data-part-action=cover]').click()",
  );
  assert.equal(await evaluate('smoke.engine.world.vehicle.filterCoverLift'), 0.45);
  await evaluate("document.querySelector('[data-part-action=filter]').click()");
  assert.equal(await evaluate('smoke.engine.world.vehicle.filter.visible'), false);
  await evaluate(
    "document.querySelector('[data-part-action=filter]').click(); document.querySelector('[data-part-action=cover]').click()",
  );
  report.parts.filterCompleted = await evaluate('smoke.inspection.workbench.activity.completed');
  assert.equal(report.parts.filterCompleted, true);
  report.checks.push(
    'Janela sobre fundo desfocado, hover com nome/informação, clique no capô e prática de filtro dentro da janela',
  );

  // Manual wheel: only tool selection uses DOM buttons; mechanical actions use actual 3D input.
  const wheelPoint = await evaluate(`(() => {
    const { engine, inspection, THREE } = smoke;
    const center = engine.world.vehicle.activeWheel.getWorldPosition(new THREE.Vector3());
    inspection.orbit.target.copy(center); inspection.camera.position.copy(center).add(new THREE.Vector3(0,0.5,2.5)); inspection.orbit.update(); inspection.camera.updateMatrixWorld(true);
    engine.renderer.render(inspection.scene, inspection.camera);
    const point = center.project(inspection.camera), rect = engine.renderer.domElement.getBoundingClientRect();
    return { x: rect.left+(point.x+1)/2*rect.width, y: rect.top+(1-point.y)/2*rect.height };
  })()`);
  async function mouseClick(point, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
  }
  async function manualTick() {
    await evaluate(
      'for(let i=0;i<30;i++) smoke.inspection.update(1/60); smoke.engine.renderer.render(smoke.inspection.scene, smoke.inspection.camera)',
    );
  }
  async function manualPoint(kind, index = 0) {
    return evaluate(`(() => {
      const { inspection, engine, THREE } = smoke, m = inspection.manual;
      m.syncTargets(); inspection.camera.updateMatrixWorld(true);
      const point = ${kind === 'wheel' ? 'm.wheel.getWorldPosition(new THREE.Vector3())' : kind === 'seat' ? 'm.seat.clone()' : kind === 'support' ? 'm.supportMarker.group.position.clone()' : kind === 'hub' ? 'm.hubMarker.group.position.clone()' : `m.boltMarkers[${index}].group.position.clone()`};
      point.project(inspection.camera); const rect = engine.renderer.domElement.getBoundingClientRect();
      return { x: rect.left+(point.x+1)/2*rect.width, y: rect.top+(1-point.y)/2*rect.height };
    })()`);
  }
  async function dragPointer(from, to, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...from,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
    for (let step = 1; step <= 8; step++)
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: from.x + ((to.x - from.x) * step) / 8,
        y: from.y + ((to.y - from.y) * step) / 8,
        buttons: 1,
        modifiers,
      });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...to,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
    await manualTick();
  }
  await mouseClick(wheelPoint);
  await evaluate("document.querySelector('[data-part-action=start-wheel]').click()");
  await manualTick();
  report.manualWheel = { stages: [] };
  const phase = () => evaluate('smoke.inspection.manual.activity.phase');
  await mouseClick(await manualPoint('wheel'));
  assert.equal(await phase(), 'prepare');
  report.manualWheel.blockedBeforeSupport = true;
  await mouseClick(await manualPoint('support'));
  assert.equal(await phase(), 'loosen');
  report.manualWheel.stages.push('apoio conferido em 3D');
  await evaluate("document.querySelector('[data-manual-tool=socket]').click()");
  for (let i = 0; i < 4; i++) {
    const point = await manualPoint('bolt', i);
    await dragPointer(point, { x: point.x - 140, y: point.y });
  }
  assert.equal(await phase(), 'removeBolts');
  report.manualWheel.stages.push('quatro fixadores soltos por giro manual');
  await evaluate("document.querySelector('[data-manual-tool=hand]').click()");
  for (let i = 0; i < 4; i++) {
    await mouseClick(await manualPoint('bolt', i));
    await manualTick();
  }
  assert.equal(await phase(), 'removeWheel');
  report.manualWheel.stages.push('fixadores retirados para bandeja');
  let point = await manualPoint('wheel');
  await dragPointer(point, { x: point.x + 160, y: point.y });
  assert.equal(await phase(), 'returnWheel');
  report.manualWheel.removed = await evaluate(
    'smoke.inspection.manual.wheel.parent === smoke.inspection.manual.stage && smoke.inspection.manual.wheel.position.distanceTo(smoke.inspection.manual.seat)>0.4',
  );
  assert.equal(report.manualWheel.removed, true);
  const removedShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-refactor/manual-wheel-removed.png', Buffer.from(removedShot.data, 'base64'));
  point = await manualPoint('wheel');
  await dragPointer(point, { x: point.x + 40, y: point.y }, 8);
  report.manualWheel.rotated = await evaluate('smoke.inspection.manual.wheelAngle > 0.4');
  assert.equal(report.manualWheel.rotated, true);
  point = await manualPoint('wheel');
  await dragPointer(point, { x: point.x - 40, y: point.y }, 8);
  await dragPointer(await manualPoint('wheel'), await manualPoint('seat'));
  assert.equal(await phase(), 'installBolts');
  report.manualWheel.stages.push('roda arrastada, girada e encaixada no cubo');
  for (let i = 0; i < 4; i++) {
    await mouseClick(await manualPoint('bolt', i));
    await manualTick();
  }
  assert.equal(await phase(), 'tighten');
  await evaluate("document.querySelector('[data-manual-tool=torque]').click()");
  point = await manualPoint('bolt', 1);
  await dragPointer(point, { x: point.x + 140, y: point.y });
  assert.equal(await evaluate('smoke.inspection.manual.activity.tightened.length'), 0);
  report.manualWheel.wrongOrderBlocked = true;
  for (const i of [0, 2, 1, 3]) {
    point = await manualPoint('bolt', i);
    await dragPointer(point, { x: point.x + 140, y: point.y });
  }
  assert.equal(await phase(), 'verify');
  report.manualWheel.stages.push('fixadores iniciados à mão e apertados em cruz');
  await evaluate("document.querySelector('[data-manual-tool=inspect]').click()");
  await mouseClick(await manualPoint('hub'));
  await manualTick();
  assert.equal(await phase(), 'complete');
  report.manualWheel.completed = true;
  report.manualWheel.saved = await evaluate(
    'Boolean(smoke.inspection.progress.data.completed["montagem-roda"])',
  );
  assert.equal(report.manualWheel.saved, true);
  report.manualWheel.actionButtons = await evaluate(
    'Array.from(document.querySelectorAll(".inspection-part [data-part-action]")).map(button=>button.dataset.partAction)',
  );
  assert.deepEqual(report.manualWheel.actionButtons, ['stop-manual-wheel']);
  const manualShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-refactor/manual-wheel-complete.png', Buffer.from(manualShot.data, 'base64'));
  await evaluate("document.querySelector('[data-part-action=stop-manual-wheel]').click()");
  report.manualWheel.restored = await evaluate(
    'smoke.engine.world.vehicle.activeWheel.parent === smoke.engine.world.vehicle.group && smoke.engine.world.vehicle.bolts.every(b=>b.parent === smoke.engine.world.vehicle.activeWheel && b.visible) && !smoke.inspection.manual',
  );
  assert.equal(report.manualWheel.restored, true);
  report.checks.push(
    'Troca manual completa: seleção de ferramentas, giros individuais, retirada por arraste, rotação, snap, sequência cruzada, conclusão e restauração',
  );

  report.inspection.detail = await evaluate(`(async () => {
    const { engine, inspection, vehicles } = smoke;
    inspection.close();
    const originalRoot = vehicles[0].root, parent = originalRoot.parent;
    await inspection.open({ ...vehicles[0], inspectionModel: '/.browser-refactor/inspection-detail.glb' });
    const loaded = Boolean(inspection.ownedModel);
    let disposed = 0; inspection.ownedModel?.traverse(object => object.geometry?.addEventListener('dispose', () => disposed++));
    engine.renderer.render(inspection.scene, inspection.camera);
    inspection.close();
    return { loaded, disposed, restored: originalRoot.parent === parent };
  })()`);
  assert.equal(report.inspection.detail.loaded, true);
  assert.ok(report.inspection.detail.disposed > 0);
  assert.equal(report.inspection.detail.restored, true);
  report.checks.push(
    'Todos os veículos selecionáveis; cena exclusiva, estado/elevador preservados, câmera orbital e GLB sob demanda verificados',
  );
  report.disposal = await evaluate(`(() => {
    const { engine, oil, ui, inspection, selection } = smoke;
    selection.dispose(); inspection.dispose(); oil.dispose(); engine.dispose(); engine.dispose(); ui.dispose();
    return { canvases: document.querySelectorAll('#viewport canvas').length, items: engine.registry.items.size, running: engine.loop.running };
  })()`);
  assert.deepEqual(report.disposal, { canvases: 0, items: 0, running: false });
  report.checks.push('Encerramento repetido remove canvas, registro e loop');
  await send('Page.navigate', { url: `${baseURL}/comparacao.html` });
  await waitFor("document.querySelector('#view')?.options.length === 6");
  report.checks.push('Segunda entrada de comparação inicializa seis câmeras');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(failedRequests.length, 0, JSON.stringify(failedRequests));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await evaluate('window.smoke?.engine.loop?.stop()').catch(error =>
    console.error('Falha ao parar fixture:', error),
  );
  await mkdir('.browser-refactor', { recursive: true });
  await writeFile('.browser-refactor/results.json', JSON.stringify(report, null, 2));
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.navigate', { url: 'about:blank' });
  for (const request of pending.values()) clearTimeout(request.timer);
  socket.close();
}
