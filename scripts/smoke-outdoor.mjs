import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

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
    const { engine, ui, interaction } = smoke;
    ui.show('home', false); ui.show('hud', true);
    engine.controls.active = false;
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    engine.camera.position.set(-7.4, 1.65, 13.5);
    engine.camera.lookAt(-7.4, 1.5, 25);
    await frame();
    const insideCalls = engine.renderer.info.render.calls;
    engine.gate.cross();
    await frame();
    const outside = engine.outdoor.outside;
    const interiorHidden = !engine.scene.visible;
    const outsideCalls = engine.renderer.info.render.calls;
    engine.camera.position.set(-7.4, 1.65, 22.1);
    engine.camera.lookAt(-7.4, 1, 25);
    await frame();
    const canEnter = interaction.update(true)?.data.id === 'carro-pista';
    engine.outdoor.enterCar();
    engine.controls.active = true;
    engine.controls.keys.add('KeyW');
    const start = engine.outdoor.car.group.position.z;
    for (let i = 0; i < 120; i++) engine.outdoor.update(1 / 60);
    engine.controls.active = false;
    const drove = engine.outdoor.car.group.position.z > start + 10;
    const exited = engine.outdoor.exitCar();
    engine.camera.position.set(-7.4, 1.65, 17.5);
    engine.gate.cross();
    await frame();
    const returned = !engine.outdoor.outside && engine.scene.visible;
    engine.camera.position.set(-18, 8, 29);
    engine.camera.lookAt(0, 0, 63);
    await frame();
    return { insideCalls, outsideCalls, outside, interiorHidden, canEnter, drove, exited, returned };
  })()`);
  for (const key of ['outside', 'interiorHidden', 'canEnter', 'drove', 'exited', 'returned'])
    assert.equal(result[key], true, key);
  assert.ok(result.outsideCalls < result.insideCalls, 'Menos chamadas de desenho fora da oficina');
  assert.deepEqual(errors, []);
  await mkdir('.browser-outdoor', { recursive: true });
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.browser-outdoor/pista.png', Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
}
