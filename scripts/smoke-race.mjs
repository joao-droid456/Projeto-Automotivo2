import assert from 'node:assert/strict';

const pages = await (await fetch('http://127.0.0.1:9225/json')).json();
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map(),
  errors = [];
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
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:5175/tests/browser-harness.html' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.smoke)')) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Harness inicializado');
  const result = await evaluate(`(async () => {
    smoke.engine.dispose();
    const { Engine } = await import('/src/core/Engine.js');
    const original = Engine.prototype.start;
    Engine.prototype.start = function(frame) { window.raceEngine = this; return original.call(this, frame); };
    const { createGame } = await import('/src/core/Game.js');
    window.raceGame = createGame(document.querySelector('#app'));
    await raceGame.start();
    Engine.prototype.start = original;
    const engine = window.raceEngine;
    engine.controls.touch = true;
    document.querySelector('#enter').click();
    engine.camera.position.copy(engine.raceHost.anchor).add(new smoke.THREE.Vector3(0, 0, 2.5));
    engine.camera.lookAt(engine.raceHost.anchor);
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await frame();
    const rect = engine.renderer.domElement.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) engine.renderer.domElement.dispatchEvent(new PointerEvent(type, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, button: 0, isPrimary: true }));
    const invited = Boolean(document.querySelector('#race-yes'));
    document.querySelector('#race-no').click();
    await frame();
    document.querySelector('#interact').click();
    document.querySelector('#race-yes').click();
    await frame();
    const race = engine.activeView;
    let outdoorTicks = 0, workshopTicks = 0;
    const originalOutdoor = engine.outdoor.update;
    const originalVehicle = engine.world.vehicle.update;
    engine.outdoor.update = () => { outdoorTicks++; };
    engine.world.vehicle.update = () => { workshopTicks++; };
    await frame();
    engine.outdoor.update = originalOutdoor;
    engine.world.vehicle.update = originalVehicle;
    const suspended = outdoorTicks === 0 && workshopTicks === 0;
    const exclusive = race?.opponents.length === 4 && !engine.scene.visible && !engine.outdoor.scene.visible;
    race.countdown = 0;
    engine.controls.keys.add('KeyW');
    const start = race.player.car.group.position.clone();
    for (let i = 0; i < 60; i++) race.update(1/60);
    const drove = start.distanceTo(race.player.car.group.position) > 2;
    document.querySelector('#pause').click();
    const paused = !engine.controls.active;
    document.querySelector('#race-resume').click();
    race.player.progress = 2;
    race.update(1/60);
    const resultShown = Boolean(document.querySelector('#race-return'));
    document.querySelector('#race-return').click();
    await frame();
    const returned = !engine.activeView && engine.outdoor.scene.visible && engine.outdoor.outside;
    return { invited, suspended, exclusive, drove, paused, resultShown, returned, portraitLoaded: engine.raceHost.group.children.at(-1).material.map.image?.width > 0 };
  })()`);
  for (const [key, value] of Object.entries(result)) assert.equal(value, true, key);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
}
