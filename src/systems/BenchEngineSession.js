import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InspectionModel, frameInspectionModel } from '../vehicles/InspectionModel.js';
import { engineParts } from '../objects/BenchEngine.js';

export class BenchEngineSession {
  constructor(engine, panel, onExit) {
    Object.assign(this, { engine, panel, onExit });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    panel.onOverview = () => this.frame();
    panel.onAction = id => {
      if (id === 'open') this.targetOpen = !this.targetOpen;
      if (id === 'run') this.running = !this.running;
      this.renderActions();
    };
    panel.element.classList.add('bench-engine-inspection');
    panel.element.querySelector('h1').id = 'bench-engine-title';
    panel.element.setAttribute('aria-labelledby', 'bench-engine-title');
    panel.element.querySelector('[data-overview]').textContent = 'Enquadrar motor';
    panel.element.querySelector('.inspection-header small').textContent =
      'BANCADA · MOTOR DE QUATRO CILINDROS';
    panel.tooltip.querySelector('small').textContent = 'Clique para selecionar a peça';
  }

  open(item) {
    if (this.active) return;
    this.active = true;
    this.item = item;
    this.descriptions = item.descriptions || engineParts;
    this.panel.element.querySelector('h1').textContent = item.data.name;
    this.panel.element.querySelector('.inspection-header small').textContent = item.descriptions ? 'ESTANTE · PEÇAS EM EXPOSIÇÃO' : 'MOTOR · COMPONENTES';
    this.targetOpen = this.running = false;
    this.engine.controls.stop();
    this.panel.captureBackground(this.engine);
    this.panel.show(item.data.name);
    this.viewport = this.panel.mountCanvas(this.engine.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#222e39');
    this.scene.add(new THREE.HemisphereLight('#e6f5ff', '#5d6674', 3));
    for (const [x, z, color] of [
      [3, 4, '#fff0d7'],
      [-3, -2, '#b7dcff'],
    ]) {
      const light = new THREE.DirectionalLight(color, 3);
      light.position.set(x, 5, z);
      this.scene.add(light);
    }
    this.container = new THREE.Group();
    this.scene.add(this.container);
    this.borrowed = new InspectionModel(item.group, this.container);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.orbit = new OrbitControls(this.camera, this.engine.renderer.domElement);
    this.orbit.enableDamping = true;
    // Reserve room for the exploded assembly before the user opens it.
    item.setExplosion?.(1);
    this.engine.setActiveView(this);
    this.frame();
    item.setExplosion?.(0);
    item.advance?.(0);
    this.panel.observeResize(() => this.engine.resize());
    this.buildPartsList();
    this.select(Object.keys(this.descriptions)[0]);
    this.panel.status(
      'Modelo didático · Passe o mouse nas peças ou escolha na lista. Abra o motor para explorar o interior.',
    );
    this.abort = new AbortController();
    const canvas = this.engine.renderer.domElement;
    canvas.addEventListener(
      'pointermove',
      e => {
        const id = this.pick(e);
        const part = this.describe(id);
        this.panel.hover(part, e.clientX, e.clientY);
        this.highlight(id || this.selected);
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      'pointerleave',
      () => {
        this.panel.hover(null);
        this.highlight(this.selected);
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      'pointerdown',
      e => {
        this.down = { x: e.clientX, y: e.clientY };
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      'pointerup',
      e => {
        if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6) {
          const id = this.pick(e);
          if (id) this.select(id);
        }
        this.down = null;
      },
      { signal: this.abort.signal },
    );
  }

  frame() {
    if (!this.active) return;
    frameInspectionModel(this.container, this.camera, this.orbit);
  }

  buildPartsList() {
    this.list?.remove();
    this.list = document.createElement('div');
    this.list.className = 'engine-parts-list';
    this.list.setAttribute('aria-label', 'Peças do motor');
    for (const [id, [name, description]] of Object.entries(this.descriptions)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.title = description;
      button.dataset.enginePart = id;
      button.onclick = () => this.select(id);
      this.list.append(button);
    }
    this.panel.element.querySelector('.inspection-part').append(this.list);
  }

  describe(id) {
    return id ? { id, name: this.descriptions[id][0], description: this.descriptions[id][1] } : null;
  }

  select(id) {
    this.selected = id;
    this.renderActions();
    this.highlight(id);
    for (const button of this.list.children)
      button.setAttribute('aria-pressed', String(button.dataset.enginePart === id));
  }

  renderActions() {
    if (this.item.descriptions) {
      this.panel.part(this.describe(this.selected), [], 'Escolha uma peça na lista ou diretamente no modelo.');
      return;
    }
    this.panel.part(
      this.describe(this.selected),
      [
        { id: 'open', label: this.targetOpen ? 'Fechar motor' : 'Abrir motor · ver interior' },
        { id: 'run', label: this.running ? 'Pausar mecanismo' : 'Animar pistões e virabrequim' },
      ],
      this.targetOpen
        ? 'Cabeçote, tampa, parede frontal e cárter afastados. Camisas ocultas para revelar os pistões.'
        : 'Escolha Abrir motor para acessar os componentes internos.',
    );
  }

  highlight(id) {
    for (const [key, meshes] of this.item.parts) {
      for (const mesh of meshes) {
        mesh.material.emissive.set(key === id ? '#72511c' : '#000000');
        mesh.material.emissiveIntensity = key === id ? 0.55 : 0;
      }
    }
  }

  pick(event) {
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const hit of this.raycaster.intersectObject(this.item.group, true)) {
      let visible = true;
      for (let node = hit.object; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      return hit.object.userData.enginePart || null;
    }
    return null;
  }

  update(dt) {
    if (this.item.descriptions) { this.orbit.update(); return; }
    const target = this.targetOpen ? 1 : 0;
    const next = THREE.MathUtils.damp(this.item.explosion, target, 5, dt);
    this.item.setExplosion?.(Math.abs(next - target) < 0.001 ? target : next);
    this.item.advance?.(dt, this.running);
    this.orbit.update();
  }

  close(notify = true) {
    if (!this.active) return;
    this.active = false;
    this.abort?.abort();
    this.orbit?.dispose();
    this.highlight(null);
    this.item.setExplosion?.(0);
    this.borrowed.restore();
    this.panel.restoreCanvas();
    this.engine.clearActiveView(this);
    this.engine.resize();
    this.panel.hide();
    this.scene.clear();
    if (notify) this.onExit();
  }

  dispose() {
    this.close(false);
    this.panel.dispose();
  }
}
