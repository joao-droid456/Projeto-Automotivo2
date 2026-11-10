import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDriving } from '../src/systems/DrivingPhysics.js';

const car = () => ({ speed: 20, steering: 0, lateralSpeed: 0, heading: 0 });

test('steering builds gradually and returns smoothly to centre', () => {
  const state = car();
  advanceDriving(state, 0, 1, false, 1 / 60);
  assert.ok(state.steering > 0 && state.steering < 0.1);
  for (let i = 0; i < 60; i++) advanceDriving(state, 0, 1, false, 1 / 60);
  assert.ok(state.steering > 0.99);
  for (let i = 0; i < 60; i++) advanceDriving(state, 0, 0, false, 1 / 60);
  assert.ok(state.steering < 0.01);
});

test('handbrake permits lateral slip and grip recovers after release', () => {
  const normal = car();
  const drift = car();
  for (let i = 0; i < 45; i++) {
    advanceDriving(normal, 1, 1, false, 1 / 60);
    advanceDriving(drift, 1, 1, true, 1 / 60);
  }
  assert.ok(Math.abs(drift.lateralSpeed) > Math.abs(normal.lateralSpeed) * 2);
  assert.ok(drift.lateralSpeed < 0, 'momentum carries the car toward the outside of the turn');
  const slip = Math.abs(drift.lateralSpeed);
  for (let i = 0; i < 120; i++) advanceDriving(drift, 0, 0, false, 1 / 60);
  assert.ok(Math.abs(drift.lateralSpeed) < slip * 0.05);
});

test('driving stays consistent across frame rates and does not turn at rest', () => {
  const simulate = fps => {
    const state = car();
    for (let i = 0; i < fps; i++) advanceDriving(state, 1, 0.5, true, 1 / fps);
    return state;
  };
  const a = simulate(30),
    b = simulate(120);
  assert.ok(Math.abs(a.heading - b.heading) < 0.03);
  assert.ok(Math.abs(a.lateralSpeed - b.lateralSpeed) < 0.3);
  const stopped = { ...car(), speed: 0 };
  advanceDriving(stopped, 0, 1, true, 1 / 60);
  assert.equal(stopped.heading, 0);
});
