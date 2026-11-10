import * as THREE from 'three';
import { Controls } from './Controls.js';
import { CollisionSystem } from './CollisionSystem.js';
import { createWorkshop } from '../world/Workshop.js';
import { EquipmentRegistry } from '../objects/EquipmentRegistry.js';
import { GameLoop } from './GameLoop.js';
import { createRenderer, applyRendererQuality } from '../graphics/Renderer.js';
import { StaticReflections } from '../graphics/StaticReflections.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';
import { Outdoor } from '../world/Outdoor.js';
import { GatePassage } from '../objects/GatePassage.js';
import { RaceHost } from '../objects/RaceHost.js';

export class Engine {
  constructor(container, config, settings, onPause) {
    Object.assign(this, { config, container });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d6dfdf');
    this.scene.fog = new THREE.Fog('#d6dfdf', 55, 100);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.08, 100);
    this.renderer = createRenderer(container);
    this.reflections = new StaticReflections(this.renderer, this.scene);
    this.disposed = false;
    try {
      this.collision = new CollisionSystem(config.playerRadius);
      this.world = createWorkshop(this.scene, this.collision, config);
      this.registry = new EquipmentRegistry(this.scene, this.world.materials, this.collision);
      this.controls = new Controls(this.camera, this.renderer.domElement, this.collision, config, onPause);
      this.controls.reset();
      this.outdoor = new Outdoor(this);
      this.registry.attach(this.outdoor.item);
      this.outdoor.group.add(this.outdoor.item.outline);
      const portrait = new THREE.TextureLoader().load(new URL('../../imagem-samuel/1000022476.jpeg', import.meta.url).href);
      this.raceHost = new RaceHost(this, portrait);
      this.registry.attach(this.raceHost);
      this.outdoor.group.add(this.raceHost.outline);
      this.gate = new GatePassage(this);
      this.registry.attach(this.gate);
      this.applySettings(settings);
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
    this.world.lights.fill.visible = settings.quality !== 'low';
    this.world.lights.secondary.visible = settings.quality !== 'low';
    this.scene.environmentIntensity = settings.quality === 'low' ? 0 : 0.25;
    this.quality = settings.quality;
    this.controls.sensitivity = settings.sensitivity;
    this.resize?.();
    if (this.initialized) this.prepareReflections();
  }
  start(onFrame) {
    if (this.disposed) throw new Error('Engine já encerrado.');
    this.onFrame = onFrame;
    this.prepareReflections();
    this.loop ??= new GameLoop(this.renderer, (dt, seconds) => {
      if (this.activeView) {
        this.activeView.update(dt);
        return;
      }
      this.controls.update(dt);
      this.outdoor.update(dt);
      if (!this.outdoor.outside) {
        this.world.vehicle.update(dt);
        for (const lift of this.world.lifts) lift.advance(dt);
        for (const item of this.registry.items.values()) item.update(seconds);
      }
      this.onFrame(dt);
    }, () => {
      const view = this.activeView || this;
      this.renderer.render(!this.activeView && this.outdoor.outside ? this.outdoor.scene : view.scene, view.camera);
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
    if (this.outdoor) { disposeObject3D(this.outdoor.scene); this.outdoor.scene.clear(); }
    this.scene.clear();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
