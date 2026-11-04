import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WheelMaintenanceActivity,
  WHEEL_MANUAL_LIMITS,
  wheelAlignmentError,
} from '../src/education/WheelMaintenanceActivity.js';
import { ConstrainedPartDrag } from '../src/interactions/ConstrainedPartDrag.js';
import { ManualWheelSession } from '../src/systems/ManualWheelSession.js';
import { Vehicle } from '../src/objects/Vehicle.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

function releasedActivity() {
  const activity = new WheelMaintenanceActivity();
  activity.confirmSupport(true);
  activity.selectTool('socket');
  for (let i = 0; i < 4; i++) activity.turnBolt(i, 1);
  activity.selectTool('hand');
  for (let i = 0; i < 4; i++) activity.removeBolt(i);
  return activity;
}

test('roda manual bloqueia retirada antes de apoio, ferramenta e quatro fixadores soltos/retirados', () => {
  const activity = new WheelMaintenanceActivity();
  assert.equal(activity.detachWheel(1, 1).ok, false);
  assert.equal(activity.confirmSupport(false).ok, false);
  activity.confirmSupport(true);
  assert.equal(activity.turnBolt(0, 1).ok, false);
  activity.selectTool('socket');
  for (let i = 0; i < 3; i++) activity.turnBolt(i, 1);
  assert.equal(activity.removeBolt(0).ok, false);
  assert.equal(activity.detachWheel(1, 1).ok, false);
  activity.turnBolt(3, 1);
  assert.equal(activity.phase, 'removeBolts');
  activity.selectTool('hand');
  for (let i = 0; i < 3; i++) activity.removeBolt(i);
  assert.equal(activity.detachWheel(1, 1).ok, false);
  activity.removeBolt(3);
  assert.equal(activity.phase, 'removeWheel');
  assert.equal(activity.detachWheel(0.1, 1).ok, false);
  assert.equal(activity.detachWheel(1, 0.1).ok, false);
  assert.equal(activity.detachWheel(1, 1).ok, true);
});

test('encaixe exige distância e alinhamento e aperto exige todos iniciados à mão na ordem cruzada', () => {
  const activity = releasedActivity();
  activity.detachWheel(1, 1);
  assert.equal(activity.installBolt(0).ok, false);
  for (const [distance, angle] of [
    [1, 0],
    [0, 0.5],
    [NaN, 0],
    [0, Infinity],
    [-1, 0],
  ])
    assert.equal(activity.canSnap(distance, angle), false);
  assert.equal(activity.canSnap(0.1, Math.PI / 2), true);
  activity.seatWheel(0.1, Math.PI / 2);
  for (let i = 0; i < 4; i++) activity.installBolt(i);
  assert.equal(activity.phase, 'tighten');
  assert.equal(activity.turnBolt(0, 1).ok, false);
  activity.selectTool('torque');
  assert.equal(activity.turnBolt(1, 1).ok, false);
  for (const i of [0, 2, 1, 3]) assert.equal(activity.turnBolt(i, 1).ok, true);
  assert.equal(activity.completed, false);
  assert.equal(activity.verify().ok, false);
  activity.selectTool('inspect');
  activity.verify();
  assert.equal(activity.completed, true);
  assert.equal(activity.verify().ok, false);
  assert.ok(wheelAlignmentError(Math.PI * 6) < 1e-8);
});

test('giros rejeitam índices e deltas inválidos e conservam progresso parcial entre gestos', () => {
  assert.throws(() => new WheelMaintenanceActivity([0, 0, 2, 3]), /sequência/);
  const activity = new WheelMaintenanceActivity();
  activity.confirmSupport(true);
  activity.selectTool('socket');
  for (const index of [-1, 4, NaN, 0.5]) assert.equal(activity.turnBolt(index, 1).ok, false);
  assert.equal(activity.turnBolt(0, Infinity).ok, false);
  activity.turnBolt(0, -1);
  assert.equal(activity.turns[0], 0);
  activity.turnBolt(0, 0.4);
  activity.turnBolt(0, 0.6);
  assert.equal(activity.loosened.has(0), true);
});

test('arraste por raio mantém o ponto de pega e não move ao encerrar ou em raio paralelo', () => {
  const drag = new ConstrainedPartDrag(),
    target = new THREE.Vector3();
  const start = new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(drag.begin(start, new THREE.Vector3(1, 1, 0), new THREE.Vector3(0, 0, 1)), true);
  drag.move(new THREE.Ray(new THREE.Vector3(2, 3, 5), new THREE.Vector3(0, 0, -1)), target);
  assert.ok(target.equals(new THREE.Vector3(3, 4, 0)));
  assert.equal(
    drag.move(new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1, 0, 0)), target),
    false,
  );
  drag.end();
  assert.equal(drag.move(start, target), false);
});

function fixture(wheelId, rotation = 0) {
  const canvas = new EventTarget(),
    captures = new Set();
  canvas.style = {};
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  canvas.setPointerCapture = id => captures.add(id);
  canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => captures.delete(id);
  const scene = new THREE.Scene(),
    vehicle = new Vehicle([0, 0, 0]);
  scene.add(vehicle.group);
  vehicle.group.rotation.y = rotation;
  const camera = new THREE.PerspectiveCamera(45, 1000 / 600, 0.01, 100);
  camera.position.set(5, 3, 6);
  const orbit = {
    target: new THREE.Vector3(),
    enabled: true,
    enableDamping: true,
    minDistance: 0.1,
    maxDistance: 20,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
    update() {
      camera.lookAt(this.target);
      camera.updateMatrixWorld(true);
    },
  };
  orbit.update();
  const saved = [];
  const inspection = {
    scene,
    camera,
    orbit,
    engine: { renderer: { domElement: canvas } },
    panel: { manualProgress() {}, clearManualWheel() {}, hover() {} },
  };
  const session = new ManualWheelSession(inspection, vehicle, {
    wheelId,
    activityId: wheelId ? `montagem-roda:${wheelId}` : 'montagem-roda',
    progress: { complete: (...args) => saved.push(args) },
  });
  function screen(point) {
    const p = point.clone().project(camera);
    return { x: (p.x + 1) * 500, y: (1 - p.y) * 300 };
  }
  function emit(type, point, extra = {}) {
    const event = new globalThis.Event(type, { cancelable: true });
    Object.assign(event, {
      clientX: point.x,
      clientY: point.y,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      shiftKey: false,
      ...extra,
    });
    canvas.dispatchEvent(event);
  }
  function click(point) {
    const p = screen(point);
    emit('pointerdown', p);
    emit('pointerup', p);
    session.update(1);
  }
  function turn(index, direction) {
    session.syncTargets();
    const p = screen(session.boltMarkers[index].group.position);
    emit('pointerdown', p);
    emit('pointermove', { x: p.x + direction * (WHEEL_MANUAL_LIMITS.pixelsPerTurn + 5), y: p.y });
    emit('pointerup', { x: p.x + direction * (WHEEL_MANUAL_LIMITS.pixelsPerTurn + 5), y: p.y });
    session.update(1);
  }
  const dispose = () => {
    session.dispose();
    disposeObject3D(scene);
  };
  return {
    canvas,
    scene,
    vehicle,
    camera,
    orbit,
    session,
    saved,
    captures,
    screen,
    emit,
    click,
    turn,
    dispose,
  };
}

for (const wheelId of ['front-wheel-left', 'front-wheel-right', 'rear-wheel-left', 'rear-wheel-right']) {
  test(`troca completa com gestos na ${wheelId} preserva as outras rodas`, () => {
    const f = fixture(wheelId),
      { session: s, vehicle: v } = f;
    const wheel = s.wheel,
      originalParent = wheel.parent,
      originalPosition = wheel.position.clone();
    const others = [...v.wheelStations.values()]
      .filter(station => station.wheel !== wheel)
      .map(station => ({
        ...station,
        position: station.wheel.position.clone(),
        quaternion: station.wheel.quaternion.clone(),
      }));
    try {
      f.click(s.supportMarker.group.position);
      assert.equal(s.activity.phase, 'loosen');
      s.selectTool('socket');
      for (let i = 0; i < 4; i++) f.turn(i, -1);
      assert.equal(s.activity.phase, 'removeBolts');
      s.selectTool('hand');
      for (let i = 0; i < 4; i++) {
        s.syncTargets();
        f.click(s.boltMarkers[i].group.position);
      }
      assert.equal(s.activity.phase, 'removeWheel');
      assert.ok(s.bolts.every(bolt => bolt.parent === s.stage));
      let p = f.screen(wheel.getWorldPosition(new THREE.Vector3()));
      f.emit('pointerdown', p);
      f.emit('pointermove', { x: p.x + 160, y: p.y });
      f.emit('pointerup', { x: p.x + 160, y: p.y });
      assert.equal(s.activity.phase, 'returnWheel');
      assert.equal(wheel.parent, s.stage);
      assert.ok(wheel.position.distanceTo(s.seat) > 0.4);
      p = f.screen(wheel.position);
      const seat = f.screen(s.seat);
      f.emit('pointerdown', p);
      f.emit('pointermove', seat);
      f.emit('pointerup', seat);
      s.update(1);
      assert.equal(s.activity.phase, 'installBolts');
      assert.equal(wheel.parent, originalParent);
      for (let i = 0; i < 4; i++) {
        s.syncTargets();
        f.click(s.boltMarkers[i].group.position);
      }
      assert.equal(s.activity.phase, 'tighten');
      s.selectTool('torque');
      for (const i of [0, 2, 1, 3]) f.turn(i, 1);
      assert.equal(s.activity.phase, 'verify');
      assert.equal(f.saved.length, 0);
      s.selectTool('inspect');
      f.click(s.hubMarker.group.position);
      assert.equal(s.activity.completed, true);
      assert.equal(f.saved.length, 1);
      assert.equal(f.saved[0][0], `montagem-roda:${wheelId}`);
      s.dispose();
      assert.ok(wheel.position.equals(originalPosition));
      assert.ok(s.bolts.every(bolt => bolt.parent === wheel && bolt.visible));
      for (const other of others) {
        assert.ok(other.wheel.position.equals(other.position));
        assert.ok(other.wheel.quaternion.equals(other.quaternion));
        assert.ok(other.bolts.every(bolt => bolt.parent === other.wheel && bolt.visible));
      }
      assert.equal(f.captures.size, 0);
    } finally {
      f.dispose();
    }
  });
}

test('cancelar durante giro/animação libera captura, restaura objetos e não descarta recursos do veículo', () => {
  const f = fixture(),
    { session: s, vehicle: v } = f;
  const position = v.activeWheel.position.clone();
  let sourceDisposed = 0;
  v.bolts[0].geometry.addEventListener('dispose', () => sourceDisposed++);
  try {
    f.click(s.supportMarker.group.position);
    s.selectTool('socket');
    const p = f.screen(s.boltMarkers[0].group.position);
    f.emit('pointerdown', p);
    f.emit('pointermove', { x: p.x - 50, y: p.y });
    assert.equal(f.orbit.enabled, false);
    f.emit('pointercancel', p);
    assert.equal(f.orbit.enabled, true);
    assert.equal(f.captures.size, 0);
    s.dispose();
    s.dispose();
    assert.equal(sourceDisposed, 0);
    assert.ok(v.activeWheel.position.equals(position));
    assert.equal(f.saved.length, 0);
    assert.ok(f.camera.position.equals(s.savedView.position));
  } finally {
    f.dispose();
  }
});

test('retirada anima suavemente, conclui a regra somente ao terminar e pode ser encerrada no meio', () => {
  const f = fixture(),
    s = f.session,
    v = f.vehicle;
  try {
    f.click(s.supportMarker.group.position);
    s.selectTool('socket');
    for (let i = 0; i < 4; i++) f.turn(i, -1);
    s.selectTool('hand');
    const before = v.bolts[0].getWorldPosition(new THREE.Vector3());
    s.transferBolt(0, 'removeBolts');
    assert.ok(v.bolts[0].position.distanceTo(before) < 1e-8);
    s.selectTool('torque');
    assert.equal(s.activity.tool, 'hand');
    s.update(0.175);
    assert.equal(s.activity.removed.has(0), false);
    assert.ok(v.bolts[0].position.distanceTo(before) > 0);
    assert.ok(v.bolts[0].position.distanceTo(s.traySlots[0]) > 0);
    s.update(0.175);
    assert.equal(s.activity.removed.has(0), true);
    s.transferBolt(1, 'removeBolts');
    s.update(0.1);
    s.dispose();
    assert.ok(v.bolts.every(bolt => bolt.parent === v.activeWheel && bolt.visible));
    assert.equal(s.animation, null);
    assert.equal(f.saved.length, 0);
  } finally {
    f.dispose();
  }
});
