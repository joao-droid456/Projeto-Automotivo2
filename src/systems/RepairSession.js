import * as THREE from 'three';
import { BodyRepairActivity } from '../education/BodyRepairActivity.js';

const torqueLayout = [3, 1, 4, 2];

export class RepairSession {
  constructor(engine, audio, onExit) {
    Object.assign(this, { engine, audio, onExit });
    this.active = false;
    this.savedPosition = new THREE.Vector3();
    this.savedQuaternion = new THREE.Quaternion();
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.striking = false;
    this.abort = new AbortController();
    this.createUI();
    document.addEventListener('keydown', event => {
      if (this.active && event.code === 'Escape') {
        event.preventDefault();
        this.close();
      }
    }, { signal: this.abort.signal });
  }

  createUI() {
    this.el = document.createElement('section');
    this.el.className = 'body-session hidden';
    this.el.setAttribute('aria-label', 'Funilaria: reparo manual da carroceria');
    this.el.innerHTML = `<header class="body-header"><div><span>FUNILARIA · REPARO MANUAL</span><h2 data-repair="title">Carro amassado</h2><small data-repair="zone"></small></div><button data-action="close">Sair do reparo ×</button></header>
      <aside class="body-guide"><small data-repair="stage"></small><progress data-repair="progress" max="4" value="0" aria-label="Progresso da funilaria"></progress>
      <h3 data-repair="step"></h3><p data-repair="instruction"></p>
      <div data-repair="map" class="body-map hidden" aria-label="Mapa de amassados"><div class="body-map-shape"></div><span class="body-map-label">FRENTE</span>
      <button class="body-dent" data-dent="0" style="left:26%;top:46%" aria-label="Amassado 1">✕</button>
      <button class="body-dent" data-dent="1" style="left:45%;top:36%" aria-label="Amassado 2">✕</button>
      <button class="body-dent" data-dent="2" style="left:62%;top:48%" aria-label="Amassado 3">✕</button>
      <button class="body-dent" data-dent="3" style="left:74%;top:34%" aria-label="Amassado 4">✕</button></div>
      <div data-repair="feedback" class="body-feedback" role="status" aria-live="polite"></div>
      <div data-repair="actions" class="body-actions"></div>
      <p class="body-hint">Siga a etapa atual · ESC sai sem concluir</p></aside>`;
    document.querySelector('#app').append(this.el);
    this.nodes = {};
    for (const node of this.el.querySelectorAll('[data-repair]')) this.nodes[node.dataset.repair] = node;
    this.markers = [...this.el.querySelectorAll('[data-dent]')];
    this.el.querySelector('[data-action="close"]').onclick = () => this.close();
    const map = this.nodes.map;
    map.addEventListener('pointerdown', event => {
      this.striking = true;
      try { map.setPointerCapture(event.pointerId); } catch { /* sem captura o clique ainda funciona */ }
      this.hitMap(event);
    });
    map.addEventListener('pointermove', event => {
      if (this.striking) this.hitMap(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      map.addEventListener(type, () => { this.striking = false; });
    }
  }

  open(driving) {
    if (this.active || !driving?.needsRepair || driving.active) return false;
    const camera = this.engine.camera;
    if (driving.car.group.position.distanceTo(camera.position) > 6.4) return false;
    this.driving = driving;
    this.savedPosition.copy(camera.position);
    this.savedQuaternion.copy(camera.quaternion);
    this.snapshot = { dents: driving.car.dentPool.map(lump => lump.visible), plate: driving.car.repairPlate.visible };
    this.engine.controls.stop();
    const zone = driving.car.repairFocus(this.point, this.normal);
    this.activity = new BodyRepairActivity(zone);
    this.active = true;
    this.striking = false;
    this.el.classList.remove('hidden');
    const severity = driving.damage >= 0.85 ? 'grave' : driving.damage >= 0.5 ? 'moderado' : 'leve';
    this.nodes.zone.textContent = `${this.activity.part} · dano ${severity}`;
    camera.position.copy(this.point).addScaledVector(this.normal, 2.6);
    camera.position.y = 1.65;
    camera.lookAt(this.point.x, 0.72, this.point.z);
    this.feedback('Escolha as ações na ordem das etapas.', false);
    this.render();
    this.nodes.actions.querySelector('button')?.focus();
    return true;
  }

  addAction(name, callback, disabled = false) {
    const button = document.createElement('button');
    button.textContent = name;
    button.disabled = disabled;
    button.onclick = callback;
    this.nodes.actions.append(button);
  }

  render() {
    const activity = this.activity;
    this.nodes.stage.textContent = activity.completed ? 'REPARO CONCLUÍDO · 4/4' : `ETAPA ${activity.stage + 1}/4`;
    this.nodes.progress.value = activity.completed ? 4 : activity.stage;
    this.nodes.step.textContent = activity.completed ? 'Carro pronto para voltar à pista' : activity.current.title;
    this.nodes.instruction.textContent = activity.completed
      ? 'Lataria alisada, peça de reposição instalada e parafusos conferidos. Saia do reparo para dirigir.'
      : activity.current.instruction;
    this.nodes.actions.replaceChildren();
    this.nodes.map.classList.toggle('hidden', activity.current?.id !== 'hammer');
    for (const [index, marker] of this.markers.entries()) {
      marker.classList.toggle('struck', activity.dents[index]);
      marker.disabled = activity.dents[index] || activity.current?.id !== 'hammer';
      marker.setAttribute('aria-pressed', String(activity.dents[index]));
    }
    if (activity.completed) {
      this.addAction('Sair do reparo e dirigir', () => this.close());
      return;
    }
    if (activity.current.id === 'fasteners') {
      for (let index = 0; index < 4; index++) {
        this.addAction(`Fixador ${index + 1}`, () => this.apply(activity.loosen(index)), activity.fasteners[index]);
      }
    } else if (activity.current.id === 'hammer') {
      const note = document.createElement('p');
      note.className = 'body-note';
      note.textContent = 'Arraste o martelo sobre os amassados no mapa.';
      this.nodes.actions.append(note);
    } else if (activity.current.id === 'install') {
      for (const name of activity.options) {
        this.addAction(name, () => {
          const result = activity.install(name);
          if (result.ok) this.driving.car.installRepairPanel();
          this.apply(result);
        });
      }
    } else if (activity.current.id === 'torque') {
      for (const number of torqueLayout) this.addAction(`Parafuso ${number}`, () => this.apply(activity.torque(number)));
    }
  }

  apply(result) {
    if (result.ok) this.audio.play();
    this.render();
    if (this.activity.completed && this.driving.needsRepair) {
      this.driving.repair();
      this.feedback(`${result.message} O carro está liberado para voltar à pista.`, true);
      this.audio.play(true);
      return true;
    }
    this.feedback(result.message, result.ok);
    return result.ok;
  }

  hitMap(event) {
    if (!this.active || this.activity.current?.id !== 'hammer') return;
    for (const [index, marker] of this.markers.entries()) {
      if (this.activity.dents[index]) continue;
      const rect = marker.getBoundingClientRect();
      if (event.clientX >= rect.left - 8 && event.clientX <= rect.right + 8
        && event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8) {
        const result = this.activity.strike(index);
        if (result.ok) {
          this.driving.car.hammerDent();
          this.audio.play();
        }
        this.apply(result);
        return;
      }
    }
  }

  feedback(message, ok) {
    this.nodes.feedback.textContent = message;
    this.nodes.feedback.className = ok ? 'body-feedback success' : 'body-feedback';
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.striking = false;
    const car = this.driving.car;
    if (!this.activity.completed) {
      car.dentPool.forEach((lump, index) => { lump.visible = this.snapshot.dents[index]; });
      car.repairPlate.visible = this.snapshot.plate;
    }
    const camera = this.engine.camera;
    camera.position.copy(this.savedPosition);
    camera.quaternion.copy(this.savedQuaternion);
    this.el.classList.add('hidden');
    this.onExit?.(this.activity.completed);
  }

  dispose() {
    this.abort.abort();
    this.el.remove();
  }
}