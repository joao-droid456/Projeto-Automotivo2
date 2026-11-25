import * as THREE from 'three';
import { Controls } from './Controls.js';
import { CollisionSystem } from './CollisionSystem.js';
import { createWorkshop } from '../world/Workshop.js';
import { createOutdoorArea } from '../world/OutdoorArea.js';
import { EquipmentRegistry } from '../objects/EquipmentRegistry.js';
import { DrivingSystem } from '../systems/DrivingSystem.js';
import { GameLoop } from './GameLoop.js';
import { createRenderer, applyRendererQuality } from '../graphics/Renderer.js';
import { StaticReflections } from '../graphics/StaticReflections.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';
import { resolveWorkshopArea, insideWorkshop } from './AreaZones.js';

const INDOOR_SKY = '#d6dfdf';
const OUTDOOR_SKY = '#b7bbb6';

export class Engine {
  constructor(container, config, settings, onPause) {
    Object.assign(this, { config, container });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(INDOOR_SKY);
    // FogExp2 densa no pátio (Silent Hill); quase imperceptível no interior.
    this.scene.fog = new THREE.FogExp2(INDOOR_SKY, 0.012);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.08, 100);
    this.renderer = createRenderer(container);
    this.reflections = new StaticReflections(this.renderer, this.scene);
    this.area = 'inside';
    this.inside = true;
    this.disposed = false;
    try {
      this.collision = new CollisionSystem(config.playerRadius);
      this.world = createWorkshop(this.scene, this.collision, config);
      this.outdoor = createOutdoorArea(this.scene, this.collision, config);
      this.registry = new EquipmentRegistry(this.scene, this.world.materials, this.collision, this.world.interior);
      this.controls = new Controls(this.camera, this.renderer.domElement, this.collision, config, onPause);
      this.driving = new DrivingSystem(this);
      this.controls.reset();
      this.applySettings(settings);
      this.applyArea('inside');
      this.resize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix();
        if (this.activeView) {
          const viewport = this.activeView.viewport || container;
          this.activeView.camera.aspect = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
          this.activeView.camera.updateProjectionMatrix();
        }
        const viewport = this.activeView?.viewport || container;
        this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
      };
      window.addEventListener('resize', this.resize); this.resize();
      this.initialized = true;
      this.onContextLost = e => { e.preventDefault(); onPause('O contexto gráfico foi interrompido. Recarregue a página para recuperar a cena.'); };
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  applySettings(settings) {
    applyRendererQuality(this.renderer, settings.quality);
    const sun = this.world.lights.sun;
    sun.castShadow = false;
    const showInterior = this.area !== 'outside';
    this.world.lights.fill.visible = showInterior && settings.quality !== 'low';
    this.world.lights.secondary.visible = showInterior && settings.quality !== 'low';
    this.scene.environmentIntensity = settings.quality === 'low' ? 0 : 0.25;
    this.quality = settings.quality;
    this.controls.sensitivity = settings.sensitivity;
    this.resize?.();
    if (this.initialized) this.prepareReflections();
  }
  /** Alterna interior, pátio ou a faixa de transição do portão. */
  applyArea(area) {
    this.area = area;
    const showInterior = area !== 'outside';
    const showOutdoor = area !== 'inside';
    this.world.interior.visible = showInterior;
    this.world.exterior.visible = showInterior;
    this.outdoor.root.visible = showOutdoor;
    this.outdoor.backdrop.visible = true;
    this.outdoor.lights.hemi.visible = showOutdoor;
    this.outdoor.lights.sun.visible = showOutdoor;
    this.world.lights.hemi.visible = showInterior;
    this.world.lights.sun.visible = showInterior;
    this.world.lights.fill.visible = showInterior && this.quality !== 'low';
    this.world.lights.secondary.visible = showInterior && this.quality !== 'low';
    if (this.fleet) this.fleet.root.visible = showInterior;
    this.applyAtmosphere();
  }
  applyAtmosphere() {
    const cameraInside = insideWorkshop(this.camera.position, this.config);
    this.inside = cameraInside;
    this.scene.background.set(cameraInside ? INDOOR_SKY : OUTDOOR_SKY);
    this.scene.fog.color.set(cameraInside ? INDOOR_SKY : OUTDOOR_SKY);
    this.scene.fog.density = cameraInside ? 0.012 : 0.03;
    this.camera.far = cameraInside ? 100 : 200;
    this.camera.updateProjectionMatrix();
  }
  updateArea() {
    if (!this.outdoor || !this.config) return;
    const driving = Boolean(this.driving?.active);
    const focus = driving ? this.driving.car.group.position : this.camera.position;
    const resolved = resolveWorkshopArea(this.camera.position, focus, driving, this.config);
    if (resolved.area !== this.area) this.applyArea(resolved.area);
    else if (resolved.inside !== this.inside) this.applyAtmosphere();
  }
  start(onFrame) {
    if (this.disposed) throw new Error('Engine já encerrado.');
    this.onFrame = onFrame;
    this.prepareReflections();
    if (this.outdoor && this.driving && typeof this.renderer.compile === 'function') {
      // Compila as três combinações antes do laço para a troca de área não travar.
      for (const area of ['inside', 'outside', 'both']) {
        this.applyArea(area);
        this.renderer.compile(this.scene, this.camera);
      }
      this.applyArea('inside');
    }
    this.loop ??= new GameLoop(this.renderer, (dt, seconds) => {
      if (this.activeView) {
        this.activeView.update(dt);
        return;
      }
      if (this.driving?.active) {
        if (this.controls.active) this.driving.update(dt);
      } else {
        this.controls.update(dt);
        this.driving?.update(dt);
      }
      this.world.vehicle.update(dt);
      for (const lift of this.world.lifts) lift.advance(dt);
      for (const item of this.registry.items.values()) item.update(seconds);
      this.onFrame(dt);
      this.updateArea();
    }, () => {
      const view = this.activeView || this;
      this.renderer.render(view.scene, view.camera);
    });
    this.loop.start();
  }
  setActiveView(view) {
    if (this.disposed) throw new Error('Engine já encerrado.');
    if (this.activeView) throw new Error('Já existe uma visualização exclusiva ativa.');
    if (!view?.scene?.isScene || !view.camera?.isCamera || typeof view.update !== 'function') {
      throw new Error('Visualização inválida: requer scene, camera e update.');
    }
    this.activeView = view;
    this.resize?.();
  }
  clearActiveView(view) {
    if (this.activeView === view) this.activeView = null;
  }
  async loadVehicles(placements) {
    if (this.disposed) throw new Error('Engine já encerrado.');
    if (this.fleet) throw new Error('Frota já inicializada.');
    const { VehicleFleet } = await import('../vehicles/VehicleFleet.js');
    if (this.disposed) return;
    this.fleet = new VehicleFleet(this.renderer, import.meta.env.BASE_URL);
    this.scene.add(this.fleet.root);
    if (this.area === 'outside') this.fleet.root.visible = false;
    try {
      for (const placement of placements) await this.fleet.load(placement);
      if (this.disposed) return;
      this.prepareReflections();
      await this.fleet.prepare(this.scene, this.camera);
    } catch (error) {
      this.fleet.dispose(); this.fleet = null;
      throw error;
    }
  }
  prepareReflections() {
    this.reflections.prepare(this.quality);
  }
  focus(item) {
    const dir = item.anchor.clone().sub(this.camera.position);
    this.controls.yaw = Math.atan2(-dir.x, -dir.z);
    this.controls.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.controls.applyRotation();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.activeView?.dispose?.();
    this.activeView = null;
    this.onFrame = null;
    this.registry?.dispose();
    this.fleet?.dispose();
    this.reflections.dispose();
    this.controls?.dispose(); window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    disposeObject3D(this.scene);
    this.scene.clear();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
