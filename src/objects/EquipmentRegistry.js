import { Equipment } from './Equipment.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';

export class EquipmentRegistry {
  constructor(scene, materials, collision, container = scene) {
    Object.assign(this, { scene, materials, collision, container });
    this.items = new Map(); this.loader = null; this.disposed = false;
  }
  async register(data, onError = () => {}) {
    this.assertActive();
    if (this.items.has(data.id)) throw new Error(`Identificador duplicado: ${data.id}`);
    const item = new Equipment(data, this.materials, this.collision);
    this.items.set(data.id, item);
    this.container.add(item.group, item.outline, item.componentOutline);
    if (data.model) {
      try {
        // Carrega o parser somente quando existir um modelo GLB cadastrado.
        if (!this.loader) { const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); this.loader = new GLTFLoader(); }
        const gltf = await this.loader.loadAsync(data.model);
        if (this.disposed) { this.disposeModel(gltf.scene); return item; }
        // Modelo substitui só a aparência. Volume de colisão continua definido nos dados.
        const oldGeometry = new Set();
        item.group.traverse(o => { if (o.geometry) oldGeometry.add(o.geometry); });
        oldGeometry.forEach(g => g.dispose());
        item.group.clear(); item.parts.clear(); item.group.add(gltf.scene);
        gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        for (const component of data.components) {
          const node = gltf.scene.getObjectByName(component.id);
          if (node) item.parts.set(component.id, node);
        }
        item.outline.update();
      } catch (error) {
        console.warn(`Falha ao carregar equipamento ${data.id}: ${data.model}`, error);
        onError(`Modelo de ${data.name} indisponível. Demonstração genérica mantida.`, error);
      }
    }
    return item;
  }
  attach(item) {
    this.assertActive();
    if (!item?.data?.id || !item.anchor?.isVector3 || typeof item.setHighlight !== 'function' || typeof item.update !== 'function') {
      throw new Error('Objeto interativo inválido: requer data.id, anchor, setHighlight e update.');
    }
    if (this.items.has(item.data.id)) throw new Error(`Identificador duplicado: ${item.data.id}`);
    this.items.set(item.data.id, item);
    this.container.add(item.outline);
    if (item.componentOutline) this.container.add(item.componentOutline);
  }
  assertActive() { if (this.disposed) throw new Error('Registro de equipamentos já encerrado.'); }
  disposeModel(root) { disposeObject3D(root); }
  // The scene owns GPU resources; the registry owns lookup references and pending loads.
  dispose() { this.disposed = true; this.items.clear(); this.loader = null; }
}
