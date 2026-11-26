import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionSystem } from '../src/core/CollisionSystem.js';
import { ProgressSystem, STORAGE_KEY } from '../src/systems/ProgressSystem.js';
import { QuizSystem } from '../src/education/QuizSystem.js';

const activities = JSON.parse(readFileSync(new URL('../public/data/activities.json', import.meta.url)));
const equipment = JSON.parse(readFileSync(new URL('../public/data/equipment.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../public/data/workshop.json', import.meta.url)));

test('colisão impede atravessamento mesmo com deslocamento grande', () => {
  const collision = new CollisionSystem(0.3);
  collision.addBox(0, 0, 0.2, 10, 'parede');
  const p = { x: -2, z: 0 }; collision.move(p, 10, 0);
  assert.ok(p.x <= -0.399); assert.equal(p.z, 0);
});
test('desliza junto à parede e impede penetração em quinas', () => {
  const c = new CollisionSystem(0.3); c.addBox(0, 0, 2, 2);
  const p = { x: -1.5, z: 0 }; c.move(p, 2, 0.6);
  assert.ok(p.x <= -1.3); assert.ok(p.z > 0.5); assert.equal(c.blocked(p.x, p.z), false);
  assert.equal(c.blocked(1.1, 1.1), true); assert.equal(c.blocked(1.4, 1.4), false);
});
test('move relata bloqueio real mesmo com deslocamento subdividido', () => {
  const free = new CollisionSystem(1.15); free.addBox(200, 200, 4, 4, 'longe');
  const p = { x: 3.7, z: -9.1 };
  assert.equal(free.move(p, 0.6944, 0.0213, 1.15), false, 'pista livre não pode bloquear por arredondamento');
  assert.ok(Math.hypot(p.x - 3.7, p.z + 9.1) > 0.69);
  const wall = new CollisionSystem(1.15); wall.addBox(5, 0, 0.4, 10, 'parede');
  assert.equal(wall.move({ x: 0, z: 0 }, 10, 0, 1.15), true);
});
test('proximidade respeita obstáculos e ignora volume do próprio equipamento', () => {
  const c = new CollisionSystem(); c.addBox(0, 0, 2, 1, 'bancada');
  assert.equal(c.lineBlocked({ x: 0, z: 3 }, { x: 0, z: 0 }, 'bancada'), false);
  c.addBox(0, 1.5, 3, 0.2, 'parede');
  assert.equal(c.lineBlocked({ x: 0, z: 3 }, { x: 0, z: 0 }, 'bancada'), true);
});
test('atividade mantém resposta inicial, explica erros e calcula resultado', () => {
  const q = new QuizSystem(activities[0]);
  assert.equal(q.next(), false); assert.equal(q.finished, false);
  assert.equal(q.answer(2).correct, false); assert.equal(q.answer(0).correct, false);
  assert.ok(q.question.explanation); assert.equal(q.next(), true);
  assert.equal(q.answer(q.question.answer).correct, true);
  assert.equal(q.next(), false); assert.equal(q.finished, true); assert.equal(q.score, 1);
});
test('salva e restaura progresso; reinício preserva configurações', () => {
  const map = new Map(); const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  const p = new ProgressSystem(storage); p.visit('bancada-demo'); p.visit('bancada-demo');
  p.complete('preparar-bancada', 2, 2); p.settings({ quality: 'low' });
  const restored = new ProgressSystem(storage);
  assert.deepEqual(restored.data.visited, ['bancada-demo']); assert.equal(restored.data.completed['preparar-bancada'].score, 2);
  restored.reset(); assert.deepEqual(restored.data.completed, {}); assert.equal(restored.data.settings.quality, 'low');
  assert.ok(map.get(STORAGE_KEY));
});
test('armazenamento bloqueado ou corrompido não impede progresso em memória', () => {
  const p = new ProgressSystem({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  p.complete('demo', 1, 2); assert.equal(p.available, false); assert.equal(p.data.completed.demo.score, 1);
  const corrupted = new ProgressSystem({ getItem: () => '{invalid' }); assert.equal(corrupted.available, false);
});
test('dados possuem IDs únicos, respostas válidas e volumes internos à sala', () => {
  assert.equal(new Set(equipment.map(e => e.id)).size, equipment.length);
  for (const item of equipment) {
    assert.ok(activities.some(a => a.id === item.activityId));
    assert.ok(Math.abs(item.position[0]) + item.size[0] / 2 < config.width / 2);
    assert.ok(Math.abs(item.position[2]) + item.size[2] / 2 < config.depth / 2);
  }
  for (const a of activities) for (const q of a.questions) { assert.ok(q.options[q.answer]); assert.ok(q.explanation); }
});
