import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceActivity, jobs } from '../src/education/ServiceActivity.js';
import { InspectionWorkbench } from '../src/systems/InspectionWorkbench.js';
import { Vehicle } from '../src/objects/Vehicle.js';
import { disposeObject3D } from '../src/utils/DisposeUtils.js';

for (const id of Object.keys(jobs)) {
  test(`${id}: exige a sequência e impede ações após concluir`, () => {
    const a = new ServiceActivity(id);
    assert.equal(a.perform('inexistente'), false);
    assert.equal(a.step, 0);
    for (const target of jobs[id].targets) assert.equal(a.perform(target), true);
    assert.equal(a.completed, true);
    assert.equal(a.perform(jobs[id].targets[0]), false);
    assert.equal(new ServiceActivity(id).step, 0);
  });
}

test('novas práticas alteram peças do carro e salvo apenas ao concluir', () => {
  const vehicle = new Vehicle(); const saved = [];
  const workbench = new InspectionWorkbench(vehicle, undefined, { complete: (...args) => saved.push(args) });
  const run = job => {
    workbench.start(job);
    for (const target of jobs[job].targets) assert.equal(workbench.perform(target).ok, true);
  };
  run('wiper'); assert.equal(vehicle.wiperBladeNew, true); assert.equal(vehicle.wiperLift, 0);
  run('washer'); assert.ok(vehicle.washerLevel > 0.5); assert.equal(vehicle.washerCapLift, 0);
  run('plugs'); assert.equal(vehicle.plugNew, true); assert.equal(vehicle.plugVisible, true);
  run('pressure'); assert.equal(vehicle.gaugeVisible, false); assert.equal(vehicle.valveCapVisible, true);
  assert.deepEqual(saved.map(args => args[0]), ['servico-wiper', 'servico-washer', 'servico-plugs', 'servico-pressure']);
  vehicle.resetServiceVisuals(); assert.equal(vehicle.plugNew, false); assert.equal(vehicle.washerLevel, 0.35);
  disposeObject3D(vehicle.group);
});

test('serviços alteram peças, terminais e luzes e salvam só ao concluir', () => {
  const vehicle = new Vehicle(); const saved = [];
  const workbench = new InspectionWorkbench(vehicle, undefined, { complete: (...args) => saved.push(args) });
  workbench.start('filter');
  workbench.perform('cover'); assert.equal(vehicle.filterCoverLift, 0.45);
  workbench.perform('filter'); assert.equal(vehicle.filter.visible, false); assert.equal(saved.length, 0);
  workbench.perform('filter'); assert.equal(vehicle.filter.visible, true);
  workbench.perform('cover'); assert.equal(vehicle.filterCoverLift, 0); assert.equal(saved[0][0], 'servico-filter');
  workbench.start('battery');
  workbench.perform('positive'); assert.equal(vehicle.terminals[1].material.color.getHexString(), 'ff8b64');
  workbench.perform('negative'); assert.equal(vehicle.terminals[0].material.color.getHexString(), '8ad6ff');
  workbench.perform('meter'); assert.equal(saved[1][0], 'servico-battery');
  workbench.start('lights');
  workbench.perform('headlights'); assert.equal(vehicle.lightsOn, true);
  vehicle.update(0.1); assert.equal(vehicle.headlightMaterial.emissiveIntensity, 2.5);
  workbench.perform('hazards'); assert.equal(vehicle.hazardsOn, true);
  workbench.perform('off'); assert.equal(vehicle.lightsOn, false); assert.equal(vehicle.hazardsOn, false);
  assert.equal(saved.length, 3);
  disposeObject3D(vehicle.group);
});
