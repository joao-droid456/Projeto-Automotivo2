import * as THREE from 'three';

function smokeTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const core = Math.max(0, 1 - Math.hypot(nx, ny));
      const puff = 0.82 + 0.18 * Math.sin(nx * 5.3) * Math.sin(ny * 4.1);
      const index = (y * size + x) * 4;
      data[index] = 255; data[index + 1] = 255; data[index + 2] = 255;
      data[index + 3] = Math.round(255 * Math.pow(core, 1.7) * puff);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Fumaça de pneu em derrapagem: puffs reciclados em um único desenho, sem crescer em memória. */
export class DriftSmoke {
  constructor(scene, capacity = 128) {
    this.capacity = capacity;
    this.index = 0;
    this.live = 0;
    this.particles = Array.from({ length: capacity }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0, size: 0,
    }));
    this.opacities = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.opacities.setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.setAttribute('aOpacity', this.opacities);
    this.material = new THREE.MeshBasicMaterial({
      color: '#e3e8e7', map: smokeTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float aOpacity;\nvarying float vOpacity;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvOpacity = aOpacity;',
      );
      shader.fragmentShader = `varying float vOpacity;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.a *= vOpacity;',
      );
    };
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = 'fumaça da derrapagem';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < capacity; i++) this.hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  hide(index) {
    this.dummy.position.set(0, -50, 0);
    this.dummy.quaternion.identity();
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
    this.opacities.setX(index, 0);
  }

  emit(x, z, strength = 1, vx = 0, vz = 0) {
    const p = this.particles[this.index];
    this.index = (this.index + 1) % this.capacity;
    if (p.life <= 0) this.live++;
    p.x = x + (Math.random() - 0.5) * 0.22;
    p.y = 0.16 + Math.random() * 0.1;
    p.z = z + (Math.random() - 0.5) * 0.22;
    p.vx = vx * 0.3 + (Math.random() - 0.5) * 1.2;
    p.vy = 0.5 + Math.random() * 0.5;
    p.vz = vz * 0.3 + (Math.random() - 0.5) * 1.2;
    p.age = 0;
    p.life = 0.8 + Math.random() * 0.5;
    p.size = (0.32 + Math.random() * 0.22) * (0.8 + Math.min(1.5, strength) * 0.5);
  }

  update(dt, camera) {
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.mesh.quaternion.identity();
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.age += step;
      const t = p.age / p.life;
      if (t >= 1) {
        p.life = 0;
        this.live--;
        this.hide(i);
        continue;
      }
      const drag = Math.exp(-1.8 * step);
      p.vx *= drag; p.vz *= drag;
      p.vy += 0.12 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.z += p.vz * step;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(p.size * (1 + 2 * t));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.opacities.setX(i, 0.5 * Math.min(1, t * 10) * Math.pow(1 - t, 1.4));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacities.needsUpdate = true;
    this.mesh.visible = this.live > 0;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.particles[i].life = 0;
      this.hide(i);
    }
    this.live = 0;
    this.index = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacities.needsUpdate = true;
    this.mesh.visible = false;
  }
}
