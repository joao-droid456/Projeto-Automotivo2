import { Raycaster, Vector2 } from 'three';

export function vehicleFromHits(hits, vehicles) {
  const roots = new Map(vehicles.map(vehicle => [vehicle.pickRoot || vehicle.root, vehicle]));
  for (const hit of hits) {
    const object = hit.object;
    if (!object.isMesh) continue;
    let visible = true;
    for (let node = object; node; node = node.parent) if (!node.visible) visible = false;
    const material = Array.isArray(object.material)
      ? object.material[hit.face?.materialIndex || 0]
      : object.material;
    if (!visible || material?.visible === false || material?.opacity === 0) continue;
    for (let node = object; node; node = node.parent) if (roots.has(node)) return roots.get(node);
    // The first rendered surface occludes vehicles behind walls/equipment.
    return null;
  }
  return null;
}

export class VehicleSelection {
  constructor(engine, vehicles, onSelect, isEnabled, surfaces = [engine.renderer.domElement]) {
    Object.assign(this, { engine, vehicles, onSelect, isEnabled });
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.hits = [];
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    for (const surface of surfaces) {
      surface.addEventListener(
        'pointerdown',
        event => {
          this.down = null;
          if (!isEnabled() || event.button !== 0 || event.isPrimary === false) return;
          this.down = { id: event.pointerId, x: event.clientX, y: event.clientY };
        },
        options,
      );
      surface.addEventListener(
        'pointermove',
        event => {
          const down = this.down;
          if (!down || down.id !== event.pointerId) return;
          if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) down.moved = true;
        },
        options,
      );
      surface.addEventListener(
        'pointerup',
        event => {
          const down = this.down;
          this.down = null;
          if (
            !down ||
            down.moved ||
            down.id !== event.pointerId ||
            !isEnabled() ||
            Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6
          )
            return;
          const vehicle = this.pick(event.clientX, event.clientY);
          if (vehicle) onSelect(vehicle);
        },
        options,
      );
      surface.addEventListener(
        'pointercancel',
        () => {
          this.down = null;
        },
        options,
      );
    }
  }

  pick(clientX, clientY) {
    const { renderer, camera } = this.engine;
    const scene = this.engine.outdoor?.outside ? this.engine.outdoor.scene : this.engine.scene;
    if (document.pointerLockElement === renderer.domElement) this.pointer.set(0, 0);
    else {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      this.pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      );
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.raycaster.far = camera.far;
    this.raycaster.setFromCamera(this.pointer, camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(scene.children, true, this.hits);
    return vehicleFromHits(this.hits, this.vehicles);
  }

  dispose() {
    this.abort.abort();
    this.down = null;
    this.hits.length = 0;
    this.vehicles = [];
  }
}
