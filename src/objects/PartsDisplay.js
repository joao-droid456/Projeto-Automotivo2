import * as THREE from 'three';

export class PartsDisplay {
  constructor(root, meshes) {
    this.group = new THREE.Group();
    this.group.name = 'Peças da estante traseira';
    this.group.position.set(-0.25, 0, -14.42);
    root.add(this.group);
    root.updateMatrixWorld(true);
    this.parts = new Map();
    this.descriptions = {};
    this.data = { id: 'pecas-estante', name: this.group.name, type: 'bench-engine' };
    meshes.forEach((mesh, index) => {
      const id = `peca-${index + 1}`;
      this.group.attach(mesh);
      mesh.userData.static = false;
      mesh.userData.enginePart = id;
      mesh.material = mesh.material.clone();
      this.parts.set(id, [mesh]);
      this.descriptions[id] = [`Componente cilíndrico ${index + 1}`, 'Peça armazenada para estudo. A forma simplificada deste modelo não permite identificar sua aplicação mecânica.'];
    });
    this.anchor = this.group.position.clone().add(new THREE.Vector3(0, 1, 0.4));
    this.outline = new THREE.BoxHelper(this.group, '#edc76b');
    this.outline.visible = false;
  }
  setHighlight(active) {
    for (const meshes of this.parts.values()) for (const mesh of meshes) {
      mesh.material.emissive.set(active ? '#72511c' : '#000000');
    }
  }
  update() {}
}
