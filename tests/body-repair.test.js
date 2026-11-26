import test from 'node:test';
import assert from 'node:assert/strict';
import { BodyRepairActivity, repairSteps } from '../src/education/BodyRepairActivity.js';

function loosenAll(activity) {
  for (let index = 0; index < 4; index++) assert.equal(activity.loosen(index).ok, true);
}
function strikeAll(activity) {
  for (let index = 0; index < 4; index++) assert.equal(activity.strike(index).ok, true);
}

test('funilaria exige fixadores, marteladas, peça certa e torque em sequência', () => {
  const activity = new BodyRepairActivity('front');
  assert.equal(activity.part, 'Para-choque dianteiro');
  assert.equal(activity.current.id, 'fasteners');
  assert.equal(activity.strike(0).ok, false, 'não martela antes de soltar a peça');
  assert.equal(activity.install(activity.part).ok, false);

  assert.equal(activity.loosen(0).ok, true);
  assert.equal(activity.loosen(0).ok, false, 'fixador repetido');
  assert.equal(activity.loosen(9).ok, false, 'fixador inexistente');
  for (let index = 1; index < 4; index++) assert.equal(activity.loosen(index).ok, true);
  assert.equal(activity.current.id, 'hammer');

  assert.equal(activity.strike(-1).ok, false);
  assert.equal(activity.strike(0).ok, true);
  assert.equal(activity.strike(0).ok, false, 'amassado repetido');
  for (let index = 1; index < 4; index++) assert.equal(activity.strike(index).ok, true);
  assert.equal(activity.current.id, 'install');

  assert.equal(activity.install('Farol dianteiro').ok, false);
  assert.equal(activity.mistakes, 1);
  assert.equal(activity.install(activity.part).ok, true);
  assert.equal(activity.current.id, 'torque');

  assert.equal(activity.torque(2).ok, false, 'fora da sequência');
  assert.equal(activity.mistakes, 2);
  assert.equal(activity.torqueOrder, 0);
  for (const number of [1, 2, 3, 4]) assert.equal(activity.torque(number).ok, true);
  assert.equal(activity.completed, true);
  assert.equal(activity.current, null);
  assert.equal(activity.torque(1).ok, false);
});

test('cada zona de dano pede a peça correspondente, com opções e etapas nomeadas', () => {
  assert.deepEqual(repairSteps.map(step => step.id), ['fasteners', 'hammer', 'install', 'torque']);
  const rear = new BodyRepairActivity('rear');
  assert.equal(rear.part, 'Para-choque traseiro');
  assert.ok(rear.options.includes('Para-choque traseiro'));
  loosenAll(rear);
  strikeAll(rear);
  assert.equal(rear.install('Painel lateral').ok, false);
  assert.equal(rear.mistakes, 1);

  const side = new BodyRepairActivity('side');
  assert.equal(side.part, 'Painel lateral');
  assert.ok(side.options.includes('Painel lateral'));
  assert.equal(new BodyRepairActivity('desconhecida').zone, 'front');
});

test('ação em etapa errada não avança nem conta como erro', () => {
  const activity = new BodyRepairActivity('front');
  const result = activity.torque(1);
  assert.equal(result.ok, false);
  assert.match(result.message, /etapa atual/);
  assert.equal(activity.mistakes, 0);
  assert.equal(activity.stage, 0);
  loosenAll(activity);
  strikeAll(activity);
  assert.equal(activity.stage, 2);
});