import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InspectionModel, frameInspectionModel } from '../vehicles/InspectionModel.js';
import { InspectionAssetLoader } from '../vehicles/InspectionAssetLoader.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';
import { InspectionPartSelection } from './InspectionPartSelection.js';
import { InspectionWorkbench } from './InspectionWorkbench.js';
import { ManualWheelSession } from './ManualWheelSession.js';
import { VEHICLE_PARTS } from '../vehicles/VehicleParts.js';

export class InspectionSession {
  constructor(engine, panel, onExit, { createOrbit, loadModel, progress, assemblyDefinition } = {}) {
    Object.assign(this, { engine, panel, onExit, progress, assemblyDefinition });
    panel.onAction = id => this.partAction(id);
    panel.onOverview = () => this.overview();
    panel.onInterior = () => this.toggleInterior();
    this.createOrbit = createOrbit || ((camera, canvas) => new OrbitControls(camera, canvas));
    this.loadModel =
      loadModel ||
      ((path, signal) => {
        this.assets ??= new InspectionAssetLoader(engine, import.meta.env?.BASE_URL || '/');
        return this.assets.load(path, signal);
      });
    this.active = false;
    this.disposed = false;
    this.generation = 0;
  }

  async open(vehicle) {
    if (this.disposed || this.active) return false;
    this.active = true;
    const generation = ++this.generation;
    this.abort = new AbortController();
    try {
      this.engine.controls.stop();
      this.panel.captureBackground?.(this.engine);
      this.panel.show(vehicle.name);
      this.viewport = this.panel.mountCanvas?.(this.engine.renderer.domElement);
      this.vehicleDescriptor = vehicle;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#27333e');
      this.scene.add(new THREE.HemisphereLight('#e9f3ff', '#8c9295', 2.5));
      const key = new THREE.DirectionalLight('#fff2dd', 3.5);
      key.position.set(3, 6, 4);
      const fill = new THREE.DirectionalLight('#bfdcff', 2);
      fill.position.set(-4, 2, -3);
      this.scene.add(key, fill);
      this.container = new THREE.Group();
      this.scene.add(this.container);
      this.camera = new THREE.PerspectiveCamera(45, this.engine.camera.aspect, 0.01, 100);
      this.borrowed = new InspectionModel(vehicle.root, this.container);
      this.orbit = this.createOrbit(this.camera, this.engine.renderer.domElement);
      this.orbit.enableDamping = true;
      this.orbit.enablePan = true;
      this.orbit.minPolarAngle = 0.03;
      this.orbit.maxPolarAngle = Math.PI - 0.03;
      frameInspectionModel(this.container, this.camera, this.orbit);
      this.engine.setActiveView(this);
      this.panel.observeResize?.(() => this.engine.resize?.());
      frameInspectionModel(this.container, this.camera, this.orbit);
      this.bindParts();
      this.panel.status(
        vehicle.inspectionModel
          ? 'Carregando versão detalhada…'
          : 'Passe o mouse nas peças e clique para ver as ações.',
      );
      if (vehicle.inspectionModel) await this.loadDetails(vehicle.inspectionModel, generation);
      return this.active && generation === this.generation;
    } catch (error) {
      this.close(false);
      throw error;
    }
  }

  async loadDetails(path, generation) {
    let root;
    const signal = this.abort.signal;
    try {
      root = await this.loadModel(path, this.abort.signal);
      if (!this.active || generation !== this.generation || signal.aborted || this.manual?.active) {
        disposeObject3D(root);
        return;
      }
      // Validate before replacing the fallback, so missing/invalid detail assets remain non-critical.
      const candidate = new THREE.Group();
      candidate.add(root);
      frameInspectionModel(candidate, this.camera, this.orbit);
      this.restoreExterior();
      this.parts?.dispose();
      this.workbench?.restore();
      this.borrowed.restore();
      this.borrowed = null;
      this.container.removeFromParent();
      this.container = candidate;
      this.scene.add(candidate);
      this.ownedModel = root;
      this.bindParts();
      this.panel.status('Versão detalhada do veículo.');
    } catch (error) {
      if (root) disposeObject3D(root);
      if (!this.active || generation !== this.generation || signal.aborted) return;
      console.warn(`Modelo detalhado indisponível: ${path}`, error);
      this.panel.status('Detalhes indisponíveis. Exibindo o modelo da oficina.');
    }
  }

  bindParts() {
    this.interiorRoot = null;
    (this.ownedModel || this.borrowed.root).traverse(object => {
      if (object.userData.vehicleInterior) this.interiorRoot = object;
    });
    this.panel.interiorView?.(Boolean(this.interiorRoot));
    const vehicle = this.borrowed ? this.vehicleDescriptor.vehicle : null;
    this.workbench = new InspectionWorkbench(vehicle, this.assemblyDefinition, this.progress);
    this.selectedPart = null;
    this.panel.part?.(null, []);
    if (this.engine.renderer.domElement.addEventListener) {
      this.parts = new InspectionPartSelection(this, this.ownedModel || this.borrowed.root, Boolean(vehicle));
    }
  }

  selectPart(part) {
    if (this.manual?.active) return;
    if ((this.selectedPart?.actionId || this.selectedPart?.id) !== (part.actionId || part.id))
      this.workbench.restore();
    this.selectedPart = part;
    this.renderPart();
  }

  renderPart(message) {
    const part = this.selectedPart;
    if (!part) return;
    if (this.manual?.active) {
      this.panel.part?.(
        {
          name: `Troca manual · ${VEHICLE_PARTS[this.manual.wheelId]?.name || 'Roda'}`,
          description:
            'Selecione a ferramenta e trabalhe diretamente nas peças desta roda. Cada roda tem seus próprios fixadores e resultado.',
        },
        [{ id: 'stop-manual-wheel', label: 'Encerrar prática e restaurar peças' }],
        this.manual.activity.instruction,
      );
      this.panel.manualWheel?.(this.manual.view);
      return;
    }
    const vehicle = this.workbench.vehicle;
    const actions = [{ id: 'focus', label: 'Examinar de perto' }];
    if (this.workbench.activity) {
      actions.push(...this.workbench.actions);
      actions.push({ id: 'stop-practice', label: 'Encerrar prática e restaurar peças' });
    } else {
      if (['hood', 'engine', 'filter', 'battery'].includes(part.id) && vehicle?.hood)
        actions.push({ id: 'hood', label: vehicle.hoodOpen ? 'Fechar capô' : 'Abrir capô' });
      const partId = part.actionId || part.id;
      const job = vehicle?.wheelStations?.has(partId)
        ? 'wheel'
        : { filter: 'filter', battery: 'battery', lights: 'lights' }[partId];
      if (job && vehicle?.filter && (job !== 'wheel' || this.assemblyDefinition))
        actions.push({
          id: `start-${job}`,
          label: {
            filter: 'Mexer no filtro de ar',
            battery: 'Testar bateria',
            lights: 'Praticar teste das luzes',
            wheel: 'Trocar roda — interação manual',
          }[job],
        });
      if (part.id === 'lights' && vehicle?.headlightMaterial)
        actions.push({ id: 'lights-toggle', label: vehicle.lightsOn ? 'Apagar faróis' : 'Acender faróis' });
    }
    this.panel.part?.(part, actions, message || this.workbench.instruction);
  }

  partAction(id) {
    if (!this.active || !this.selectedPart) return;
    if (id === 'stop-manual-wheel') {
      this.manual?.dispose();
      this.manual = null;
      this.renderPart();
      return;
    }
    if (id === 'start-wheel') {
      if (this.manual?.active) return;
      try {
        this.restoreExterior();
        this.workbench.restore();
        const wheelId = this.selectedPart.actionId || this.selectedPart.id;
        this.manual = new ManualWheelSession(this, this.workbench.vehicle, {
          order: this.assemblyDefinition?.boltOrder,
          progress: this.progress,
          activityId: `${this.assemblyDefinition?.id || 'montagem-roda'}:${wheelId}`,
          wheelId,
          onChange: () => this.renderPart(),
        });
        // Keep the active mechanical graph stable if the optional detail fetch is still pending.
        this.abort.abort();
        this.assets?.dispose();
        this.assets = null;
        if (this.parts) {
          this.parts.down = null;
          this.parts.outline.visible = false;
        }
        this.panel.hover?.(null);
        this.panel.onManualTool = tool => this.manual?.selectTool(tool);
        this.renderPart();
      } catch (error) {
        console.error('Falha ao preparar roda manual:', error);
        this.renderPart('A roda precisa estar montada no carro didático e ter os apoios disponíveis.');
      }
      return;
    }
    if (this.manual?.active) return;
    const v = this.workbench.vehicle;
    if (id === 'focus') {
      const offset = this.camera.position
        .clone()
        .sub(this.orbit.target)
        .setLength(Math.max(1.4, this.orbit.minDistance * 2));
      const target = this.selectedPart.localPoint
        ? this.selectedPart.object.localToWorld(this.selectedPart.localPoint.clone())
        : this.selectedPart.point;
      this.orbit.target.copy(target);
      this.camera.position.copy(this.orbit.target).add(offset);
      this.orbit.update();
      return;
    }
    if (id === 'hood' && v?.hood) v.setHood(!v.hoodOpen);
    else if (id === 'lights-toggle' && v?.headlightMaterial) v.lightsOn = !v.lightsOn;
    else if (id.startsWith('start-')) this.workbench.start(id.slice(6));
    else if (id === 'stop-practice') this.workbench.restore();
    else {
      const result = this.workbench.perform(id);
      this.renderPart(result.message);
      return;
    }
    this.renderPart();
  }

  overview() {
    if (this.manual?.active) {
      this.manual.focus();
      return;
    }
    if (this.active) {
      this.restoreExterior();
      frameInspectionModel(this.container, this.camera, this.orbit);
    }
  }

  toggleInterior() {
    if (!this.active || !this.interiorRoot || this.manual?.active) return;
    if (this.hiddenExterior) {
      this.restoreExterior();
      frameInspectionModel(this.container, this.camera, this.orbit);
      return;
    }
    this.workbench?.restore();
    this.hiddenExterior = [];
    const root = this.ownedModel || this.borrowed.root;
    root.traverse(object => {
      if (!object.isMesh) return;
      for (let node = object; node; node = node.parent) if (node === this.interiorRoot) return;
      this.hiddenExterior.push({ object, visible: object.visible });
      object.visible = false;
    });
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.interiorRoot);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length();
    this.orbit.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(radius * 0.7, radius * 0.52, radius * 0.62));
    this.orbit.minDistance = 0.15;
    this.orbit.update();
    if (this.parts) {
      this.parts.dirty = true;
      this.parts.outline && (this.parts.outline.visible = false);
    }
    this.panel.hover?.(null);
    this.panel.interiorView?.(true, true);
    this.selectedPart = null;
    this.panel.part?.(null, []);
    this.panel.status(
      'Interior em corte · Arraste para girar e aproxime para explorar bancos, painel e controles.',
    );
  }

  restoreExterior() {
    if (!this.hiddenExterior) return;
    for (const { object, visible } of this.hiddenExterior) object.visible = visible;
    this.hiddenExterior = null;
    this.panel.interiorView?.(Boolean(this.interiorRoot));
    if (this.parts) this.parts.dirty = true;
    this.panel.status('Passe o mouse nas peças e clique para examinar.');
  }

  update(dt = 0) {
    const vehicle = this.workbench?.vehicle;
    if (vehicle?.filter) vehicle.update(dt);
    else if (vehicle?.hood) {
      vehicle.hood.rotation.z = THREE.MathUtils.damp(
        vehicle.hood.rotation.z,
        vehicle.hoodOpen ? -1.05 : 0,
        8,
        dt,
      );
      vehicle.headlightMaterial.emissiveIntensity = vehicle.lightsOn ? 2.5 : 0.05;
    }
    this.orbit?.update();
    this.manual?.update(dt);
    this.parts?.update();
  }

  close(notify = true) {
    if (!this.active) return;
    this.active = false;
    ++this.generation;
    this.abort.abort();
    this.assets?.dispose();
    this.assets = null;
    this.restoreExterior();
    this.manual?.dispose();
    this.manual = null;
    this.parts?.dispose();
    this.parts = null;
    this.workbench?.restore();
    this.workbench = null;
    this.engine.clearActiveView(this);
    this.orbit?.dispose();
    this.orbit = null;
    this.borrowed?.restore();
    this.borrowed = null;
    if (this.ownedModel) disposeObject3D(this.ownedModel);
    this.ownedModel = null;
    this.scene?.clear();
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.selectedPart = null;
    this.vehicleDescriptor = null;
    this.viewport = null;
    this.panel.restoreCanvas?.();
    this.panel.hide();
    this.engine.resize?.();
    if (notify) this.onExit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.close(false);
    this.assets?.dispose();
    this.panel.dispose();
  }
}
