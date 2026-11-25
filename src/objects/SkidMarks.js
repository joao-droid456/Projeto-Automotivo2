import * as THREE from 'three';

function markTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs((x + 0.5) / size - 0.5) * 2;
      const dy = Math.abs((y + 0.5) / size - 0.5) * 2;
      const soft = Math.max(0, 1 - Math.pow(dx, 6)) * Math.max(0, 1 - Math.pow(dy, 2));
      const index = (y * size + x) * 4;
      data[index] = 28; data[index + 1] = 26; data[index + 2] = 24;
      data[index + 3] = Math.round(190 * soft);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Marcas de pneu recicladas por um anel de instâncias, sem crescer em memória. */
export class SkidMarks {
  constructor(scene, capacity = 520) {
    this.capacity = capacity;
    this.index = 0;
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff', map: markTexture(), transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 1.05), material, capacity);
    this.mesh.name = 'marcas de derrapagem';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy = new THREE.Object3D();
    this.dummy.position.set(0, -50, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    scene.add(this.mesh);
  }

  stamp(x, z, heading) {
    // Acima do asfalto da pista (0,03) e das faixas pintadas (0,056).
    this.dummy.position.set(x, 0.068, z);
    this.dummy.rotation.set(-Math.PI / 2, 0, -heading);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.index, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.index = (this.index + 1) % this.capacity;
  }

  clear() {
    this.dummy.position.set(0, -50, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.index = 0;
  }
}
