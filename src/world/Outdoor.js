import * as THREE from 'three';
import { Vehicle } from '../objects/Vehicle.js';
import { advanceDriving } from '../systems/DrivingPhysics.js';
import { batchStaticWorld } from './StaticBatching.js';

export class Outdoor {
  constructor(engine) {
    this.engine = engine;
    this.outside = false;
    this.driving = false;
    this.speed = 0;
    this.steering = 0;
    this.lateralSpeed = 0;
    this.heading = Math.PI;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a9d3ed');
    this.scene.fog = new THREE.Fog('#a9d3ed', 160, 300);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#788963', 2.5));
    const sun = new THREE.DirectionalLight('#fff2d8', 2.5);
    sun.position.set(-25, 45, 30);
    this.scene.add(sun);
    const root = new THREE.Group();
    this.group = new THREE.Group();
    this.group.add(root);
    engine.scene.add(this.group);
    const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const grass = material('#6f9255'),
      asphalt = material('#343c43');
    const white = material('#e9e7dc'),
      wall = material('#d9ddd6');
    const box = (name, size, position, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.userData.static = true;
      root.add(mesh);
      return mesh;
    };
    box('Terreno externo', [260, 0.2, 240], [0, -0.13, 95], grass);
    box('Pátio da oficina', [40, 0.08, 20], [0, -0.03, 25], asphalt);
    // An oval circuit with two straights and semicircular ends.
    const shape = new THREE.Shape();
    shape.moveTo(-45, 40);
    shape.lineTo(45, 40);
    shape.absarc(45, 65, 25, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-45, 90);
    shape.absarc(-45, 65, 25, Math.PI / 2, Math.PI * 1.5, false);
    const hole = new THREE.Path();
    hole.moveTo(-45, 49);
    hole.absarc(-45, 65, 16, -Math.PI / 2, -Math.PI * 1.5, true);
    hole.lineTo(45, 81);
    hole.absarc(45, 65, 16, Math.PI / 2, -Math.PI / 2, true);
    hole.closePath();
    shape.holes.push(hole);
    const track = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), asphalt);
    track.rotation.x = Math.PI / 2;
    track.position.y = 0.025;
    track.material.side = THREE.DoubleSide;
    root.add(track);
    box('Acesso à pista', [9, 0.06, 18], [-7.4, 0, 38], asphalt);
    for (let i = 0; i < 140; i++) {
      const t = (i / 140) * (180 + 41 * Math.PI);
      let x, z, angle;
      if (t < 90) {
        x = -45 + t;
        z = 44.5;
        angle = 0;
      } else if (t < 90 + 20.5 * Math.PI) {
        angle = (t - 90) / 20.5 - Math.PI / 2;
        x = 45 + Math.cos(angle) * 20.5;
        z = 65 + Math.sin(angle) * 20.5;
        angle += Math.PI / 2;
      } else if (t < 180 + 20.5 * Math.PI) {
        x = 45 - (t - 90 - 20.5 * Math.PI);
        z = 85.5;
        angle = 0;
      } else {
        angle = (t - 180 - 20.5 * Math.PI) / 20.5 + Math.PI / 2;
        x = -45 + Math.cos(angle) * 20.5;
        z = 65 + Math.sin(angle) * 20.5;
        angle += Math.PI / 2;
      }
      box('Faixa tracejada', [1.2, 0.045, 0.14], [x, 0.055, z], white).rotation.y = -angle;
    }
    const { config, collision } = engine;
    const gate = config.reconstruction.gate,
      half = config.width / 2,
      front = config.depth / 2;
    const left = gate.x - gate.width / 2,
      right = gate.x + gate.width / 2;
    box(
      'Fachada esquerda',
      [left + half, config.height, 0.3],
      [(left - half) / 2, config.height / 2, front],
      wall,
    );
    box(
      'Fachada direita',
      [half - right, config.height, 0.3],
      [(right + half) / 2, config.height / 2, front],
      wall,
    );
    box(
      'Verga do portão',
      [gate.width, config.height - gate.height, 0.3],
      [gate.x, (config.height + gate.height) / 2, front],
      wall,
    );
    this.gateMesh = box(
      'Portão sólido fechado externo',
      [gate.width, gate.height, 0.24],
      [gate.x, gate.height / 2, front],
      material('#657078'),
    );
    this.gateMesh.userData.static = false;
    this.gateMesh.visible = false;
    for (const side of [-1, 1])
      box('Lateral externa', [0.3, config.height, config.depth], [side * half, config.height / 2, 0], wall);
    box(
      'Cobertura externa',
      [config.width + 0.4, 0.3, config.depth],
      [0, config.height, 0],
      material('#69797f'),
    );
    for (const x of [-85, 85]) {
      box('Barreira lateral', [0.5, 0.7, 100], [x, 0.35, 65], white);
      collision.addBox(x, 65, 0.5, 100, 'limite-pista');
    }
    for (const z of [15, 115]) {
      if (z === 15) {
        collision.addBox(-47.5, z, 75, 0.5, 'limite-patio');
        collision.addBox(47.5, z, 75, 0.5, 'limite-patio');
      } else collision.addBox(0, z, 170, 0.5, 'limite-pista');
    }
    const bark = material('#705039');
    const foliage = [material('#365f38'), material('#4c7742'), material('#5d8547')];
    const trunk = new THREE.CylinderGeometry(0.25, 0.4, 3, 7);
    const crown = new THREE.IcosahedronGeometry(2.4, 1);
    const tree = (x, z, i) => {
      const scale = 0.85 + (i % 5) * 0.12;
      for (const [name, geometry, mat, y] of [
        ['Tronco de ?rvore', trunk, bark, 1.5],
        ['Copa de ?rvore', crown, foliage[i % 3], 4.1],
      ]) {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.name = name;
        mesh.position.set(x, y * scale, z);
        mesh.scale.setScalar(scale);
        mesh.userData.static = true;
        root.add(mesh);
      }
      collision.addBox(x, z, 1.2, 1.2, 'arvore');
    };
    for (let i = 0; i < 15; i++) {
      tree(-98 - (i % 3) * 5, 22 + i * 8, i);
      tree(98 + (i % 3) * 5, 22 + i * 8, i + 2);
      tree(-90 + i * 13, 137 + (i % 3) * 5, i);
    }
    for (let i = 0; i < 8; i++) tree(-35 + i * 10, 65 + (i % 2 ? 5 : -5), i);
    const red = material('#b84c40');
    for (const z of [40, 90]) {
      for (let i = 0; i < 60; i++) {
        const x = -45 + i * 1.5;
        if (z === 40 && x > -13 && x < -2) continue;
        box('Zebra da pista', [1.5, 0.04, 0.6], [x, 0.04, z], i % 2 ? red : white);
      }
    }
    const metal = material('#59656c');
    for (const x of [-78, 78]) {
      for (const z of [30, 65, 100]) {
        box('Poste de ilumina??o', [0.18, 7, 0.18], [x, 3.5, z], metal);
        box('Lumin?ria', [1.6, 0.18, 0.65], [x, 7, z], white);
      }
    }
    batchStaticWorld(root);
    this.car = new Vehicle([-7.4, 0, 25], { color: '#d55c32', displayOnly: true });
    batchStaticWorld(this.car.group);
    this.car.group.rotation.y = this.heading - Math.PI / 2;
    this.group.add(this.car.group);
    this.carCollider = collision.addBox(-7.4, 25, 2.1, 4.5, 'carro-pista');
    this.item = {
      data: { id: 'carro-pista', name: 'Carro da pista · E para dirigir', type: 'driving', exterior: true },
      actionLabel: 'E · Dirigir / sair · W/S acelerar · A/D virar · Espaço frear',
      anchor: new THREE.Vector3(-7.4, 1, 25),
      outline: new THREE.BoxHelper(this.car.group, '#edc76b'),
      setHighlight: value => {
        this.item.outline.visible = value;
      },
      update() {},
    };
    this.item.outline.visible = false;
    this.group.add(this.item.outline);
  }

  enterCar() {
    if (!this.outside || this.driving) return;
    this.driving = true;
    this.engine.controls.driving = true;
    this.engine.controls.clear();
    this.carCollider.enabled = false;
    this.item.setHighlight(false);
  }

  exitCar() {
    if (!this.driving) return true;
    const { collision, camera, config, controls } = this.engine;
    const p = this.car.group.position;
    for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const x = p.x - Math.sin(this.heading + offset) * 3;
      const z = p.z - Math.cos(this.heading + offset) * 3;
      if (x < -84 || x > 84 || z < 16 || z > 114 || collision.blocked(x, z)) continue;
      camera.position.set(x, config.eyeHeight, z);
      controls.yaw = this.heading;
      controls.pitch = 0;
      controls.driving = this.driving = false;
      controls.clear();
      controls.applyRotation();
      this.speed = 0;
      this.lateralSpeed = 0;
      this.steering = 0;
      this.carCollider.enabled = true;
      return true;
    }
    return false;
  }

  update(dt) {
    const { controls, camera, config } = this.engine;
    if (this.driving && controls.active) {
      const k = controls.keys;
      const throttle =
        Number(k.has('KeyW') || k.has('ArrowUp')) -
        Number(k.has('KeyS') || k.has('ArrowDown')) -
        controls.stick.y;
      const steer =
        Number(k.has('KeyD') || k.has('ArrowRight')) -
        Number(k.has('KeyA') || k.has('ArrowLeft')) +
        controls.stick.x;
      dt = Math.min(Math.max(dt, 0), 0.05);
      const motion = advanceDriving(this, throttle, steer, k.has('Space'), dt);
      const p = this.car.group.position;
      const x = p.x + motion.x;
      const z = p.z + motion.z;
      if (x > -82 && x < 82 && z > 18 && z < 112 && !this.engine.collision.blocked(x, z)) p.set(x, 0, z);
      else {
        this.speed = 0;
        this.lateralSpeed = 0;
      }
      this.car.group.rotation.y = this.heading - Math.PI / 2;
      this.item.anchor.set(p.x, 1, p.z);
      Object.assign(this.carCollider, { minX: p.x - 2.3, maxX: p.x + 2.3, minZ: p.z - 2.3, maxZ: p.z + 2.3 });
      camera.position.lerp(
        new THREE.Vector3(
          p.x + Math.sin(this.heading) * 6,
          3.6,
          Math.max(15.6, p.z + Math.cos(this.heading) * 6),
        ),
        1 - Math.exp(-8 * dt),
      );
      camera.lookAt(p.x - Math.sin(this.heading) * 4, 0.9, p.z - Math.cos(this.heading) * 4);
    }
    this.outside = this.driving || camera.position.z > config.depth / 2;
    this.gateMesh.visible = this.outside;
    // The renderer receives only this lightweight scene while outside.
    this.engine.scene.visible = !this.outside;
    const parent = this.outside ? this.scene : this.engine.scene;
    if (this.group.parent !== parent) parent.add(this.group);
    this.item.outline.update();
  }
}
