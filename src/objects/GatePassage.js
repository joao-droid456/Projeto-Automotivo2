import * as THREE from 'three';

export class GatePassage {
  constructor(engine) {
    this.engine = engine;
    const gate = engine.config.reconstruction.gate;
    const front = engine.config.depth / 2;
    this.data = { id: 'portao-passagem', name: 'Portão · atravessar', type: 'gate', bothZones: true };
    this.actionLabel = 'E · Atravessar o portão · ou toque neste botão';
    this.anchor = new THREE.Vector3(gate.x, 1.35, front);
    this.outline = new THREE.Group();
    this.material = new THREE.MeshStandardMaterial({ color: '#55c58b', emissive: '#123d25' });
    for (const side of [-1, 1]) {
      const button = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), this.material);
      button.name = 'Botão de passagem do portão';
      button.position.set(gate.x + gate.width / 2 - 0.45, 1.35, front + side * 0.19);
      if (side < 0) this.outline.add(button);
      else engine.outdoor.group.add(button);
    }
  }

  setHighlight(active) {
    this.material.emissive.set(active ? '#55a86e' : '#123d25');
  }

  update() {
    this.data.name = this.engine.outdoor.outside
      ? 'Portão · entrar na oficina'
      : 'Portão · sair para a pista';
  }

  cross() {
    const { camera, config, controls, collision, outdoor } = this.engine;
    if (outdoor.driving || camera.position.distanceTo(this.anchor) >= config.interactionDistance)
      return false;
    if (collision.lineBlocked(camera.position, this.anchor, this.data.id)) return false;
    const side = outdoor.outside ? -1 : 1;
    const gate = config.reconstruction.gate;
    const z = config.depth / 2 + side * 1.3;
    for (const dx of [0, -0.6, 0.6]) {
      const x = gate.x + dx;
      if (collision.blocked(x, z)) continue;
      camera.position.set(x, config.eyeHeight, z);
      controls.clear();
      controls.yaw = side > 0 ? Math.PI : 0;
      controls.pitch = 0;
      controls.applyRotation();
      outdoor.update(0);
      this.update();
      return true;
    }
    return false;
  }
}
