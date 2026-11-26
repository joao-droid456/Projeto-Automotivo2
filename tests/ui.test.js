import test from 'node:test';
import assert from 'node:assert/strict';
import { AppUI } from '../src/ui/AppUI.js';

test('aproximar, operar e sair do elevador atualiza o HUD sem interromper os quadros', () => {
  const original = globalThis.document;
  const nodes = new Map();
  const root = {
    set innerHTML(html) {
      for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
        const classes = new Set();
        nodes.set(id, {
          textContent: '',
          classList: {
            toggle(name, force) { force ? classes.add(name) : classes.delete(name); },
            contains(name) { return classes.has(name); },
          },
        });
      }
    },
  };
  globalThis.document = { getElementById: id => nodes.get(id) ?? null, addEventListener() {} };
  try {
    const ui = new AppUI(root);
    const target = { data: { name: 'Elevador 1', type: 'lift' }, actionLabel: 'E / tocar para subir' };
    for (let frame = 0; frame < 120; frame++) ui.updateInteraction(target, true);
    assert.equal(nodes.get('target-name').textContent, 'Elevador 1');
    assert.equal(nodes.get('target-action').textContent, target.actionLabel);
    assert.equal(nodes.get('interact').classList.contains('hidden'), false);
    target.actionLabel = 'Em movimento · aguarde';
    ui.updateInteraction(target, true);
    assert.equal(nodes.get('target-action').textContent, target.actionLabel);
    ui.updateInteraction({ data: { name: 'Bancada', type: 'equipment' } }, true);
    assert.equal(nodes.get('target-action').textContent, 'Conhecer equipamento · demonstração');
    ui.updateInteraction(null, true);
    assert.equal(nodes.get('interact').classList.contains('hidden'), true);
    ui.updateInteraction(target, false);
    assert.equal(nodes.get('interact').classList.contains('hidden'), true);
    const driving = { active: true, motion: { speedKmh: 42, gear: 'D' }, needsRepair: true };
    ui.updateDrive(driving);
    assert.equal(nodes.get('drive-speed').textContent, '042');
    assert.equal(nodes.get('repair-card').classList.contains('hidden'), false);
    driving.needsRepair = false;
    ui.updateDrive(driving);
    assert.equal(nodes.get('repair-card').classList.contains('hidden'), true);
    ui.updateDrive(null);
    assert.equal(nodes.get('drive-hud').classList.contains('hidden'), true);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
