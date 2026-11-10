import * as THREE from 'three';

export class RaceHost {
  constructor(engine, texture) {
    const gate = engine.config.reconstruction.gate;
    this.data = { id: 'samuel', name: 'Samuel · Convite para corrida', type: 'race-host', exterior: true };
    this.actionLabel = 'Clique ou aperte E para conversar';
    this.group = new THREE.Group();
    this.group.position.set(gate.x + gate.width / 2 + 1.5, 0, engine.config.depth / 2 + 2);
    const part = (size, color, position) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
      mesh.position.set(...position);
      this.group.add(mesh);
    };
    part([0.65, 0.8, 0.35], '#202a31', [0, 1.05, 0]);
    for (const x of [-0.2, 0.2]) {
      part([0.24, 0.65, 0.28], '#344253', [x, 0.34, 0]);
      part([0.18, 0.72, 0.22], '#202a31', [x * 2.3, 1.05, 0]);
    }
    part([0.55, 0.64, 0.4], '#c39476', [0, 1.77, 0]);
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.repeat.set(0.66, 0.7);
      texture.offset.set(0.32, 0.17);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.65),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      );
      face.position.set(0, 1.77, 0.21);
      this.group.add(face);
    }
    this.anchor = this.group.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    this.outline = new THREE.BoxHelper(this.group, '#edc76b');
    this.outline.visible = false;
    engine.outdoor.group.add(this.group, this.outline);
    engine.collision.addBox(this.group.position.x, this.group.position.z, 0.8, 0.6, this.data.id);
  }
  setHighlight(value) {
    this.outline.visible = value;
  }
  update() {}
}
