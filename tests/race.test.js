import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Race, raceProgress, RACE_LAPS } from '../src/world/Race.js';
import { RaceHost } from '../src/objects/RaceHost.js';
import { CollisionSystem } from '../src/core/CollisionSystem.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

test('race checkpoints cross the start line correctly and reject shortcuts and reverse progress', () => {
  assert.ok(raceProgress(Math.PI - 0.01, -Math.PI + 0.01, 70) > 0);
  assert.ok(raceProgress(0.1, 0, 70) < 0);
  assert.equal(raceProgress(0, 1, 70), 0);
  assert.equal(raceProgress(0, 0.1, 30), 0);
});

test('Samuel stands outside beside the gate and supports interaction', () => {
  const engine = {
    config: { depth: 30, reconstruction: { gate: { x: -7.4, width: 4 } } },
    outdoor: { group: new THREE.Group() },
    collision: new CollisionSystem(),
  };
  const host = new RaceHost(engine);
  assert.ok(host.group.position.z > 15);
  assert.ok(host.group.position.x > -5.4);
  assert.equal(host.data.exterior, true);
  host.setHighlight(true);
  assert.equal(host.outline.visible, true);
  disposeObject3D(engine.outdoor.group);
});

test('race has four moving opponents, countdown, pause, finish order and disposal', () => {
  const engine = {
    camera: { aspect: 1.6 },
    controls: { active: true, keys: new Set(), stick: { x: 0, y: 0 } },
  };
  let result;
  const race = new Race(engine, value => {
    result = value;
  });
  assert.equal(race.opponents.length, 4);
  const initial = race.opponents[0].progress;
  race.update(0.05);
  assert.equal(race.opponents[0].progress, initial);
  race.countdown = 0;
  for (let i = 0; i < 60; i++) race.update(1 / 60);
  assert.ok(race.opponents[0].progress > initial);
  engine.controls.active = false;
  const elapsed = race.elapsed;
  race.update(0.05);
  assert.equal(race.elapsed, elapsed);
  engine.controls.active = true;
  race.opponents[0].finishTime = elapsed;
  race.player.progress = RACE_LAPS;
  race.update(1 / 60);
  assert.equal(result.position, 2);
  race.dispose();
  race.dispose();
  assert.equal(race.scene.children.length, 0);
});
