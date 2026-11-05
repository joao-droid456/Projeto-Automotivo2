import * as THREE from 'three';
import { Vehicle } from '../objects/Vehicle.js';
import { batchStaticWorld } from './StaticBatching.js';

export class Outdoor {
  constructor(engine) {
    this.engine = engine;
    this.outside = false;
    this.driving = false;
    this.speed = 0;
    this.heading = Math.PI;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a9d3ed');
    this.scene.fog = new THREE.Fog('#a9d3ed', 100, 200);
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
    box('Terreno externo', [190, 0.2, 180], [0, -0.13, 75], grass);
    box('Pátio da oficina', [40, 0.08, 20], [0, -0.03, 25], asphalt);
    // An oval circuit with two straights and semicircular ends.
    const shape = new THREE.Shape();
    shape.moveTo(-25, 40);
    shape.lineTo(25, 40);
    shape.absarc(25, 65, 25, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-25, 90);
    shape.absarc(-25, 65, 25, Math.PI / 2, Math.PI * 1.5, false);
    const hole = new THREE.Path();
    hole.moveTo(-25, 49);
    hole.absarc(-25, 65, 16, -Math.PI / 2, -Math.PI * 1.5, true);
    hole.lineTo(25, 81);
    hole.absarc(25, 65, 16, Math.PI / 2, -Math.PI / 2, true);
    hole.closePath();
    shape.holes.push(hole);
    const track = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), asphalt);
    track.rotation.x = Math.PI / 2;
    track.position.y = 0.025;
    track.material.side = THREE.DoubleSide;
    root.add(track);
    box('Acesso à pista', [9, 0.06, 18], [-7.4, 0, 38], asphalt);
    for (let i = 0; i < 100; i++) {
      const t = (i / 100) * (100 + 41 * Math.PI);
      let x, z, angle;
      if (t < 50) {
        x = -25 + t;
        z = 44.5;
        angle = 0;
      } else if (t < 50 + 20.5 * Math.PI) {
        angle = (t - 50) / 20.5 - Math.PI / 2;
        x = 25 + Math.cos(angle) * 20.5;
        z = 65 + Math.sin(angle) * 20.5;
        angle += Math.PI / 2;
      } else if (t < 100 + 20.5 * Math.PI) {
        x = 25 - (t - 50 - 20.5 * Math.PI);
        z = 85.5;
        angle = 0;
      } else {
        angle = (t - 100 - 20.5 * Math.PI) / 20.5 + Math.PI / 2;
        x = -25 + Math.cos(angle) * 20.5;
        z = 65 + Math.sin(angle) * 20.5;
        angle += Math.PI / 2;
      }
      box('Faixa tracejada', [1.2, 0.025, 0.14], [x, 0.055, z], white).rotation.y = -angle;
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
    for (const x of [-65, 65]) {
      box('Barreira lateral', [0.5, 0.7, 100], [x, 0.35, 65], white);
      collision.addBox(x, 65, 0.5, 100, 'limite-pista');
    }
    for (const z of [15, 115]) {
      if (z === 15) {
        collision.addBox(-37.5, z, 55, 0.5, 'limite-patio');
        collision.addBox(37.5, z, 55, 0.5, 'limite-patio');
      } else collision.addBox(0, z, 130, 0.5, 'limite-pista');
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
      if (x < -64 || x > 64 || z < 16 || z > 114 || collision.blocked(x, z)) continue;
      camera.position.set(x, config.eyeHeight, z);
      controls.yaw = this.heading;
      controls.pitch = 0;
      controls.driving = this.driving = false;
      controls.clear();
      controls.applyRotation();
      this.speed = 0;
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
      this.speed += throttle * 9 * dt;
      this.speed *= Math.exp(-(k.has('Space') ? 7 : throttle ? 0.15 : 0.8) * dt);
      this.speed = THREE.MathUtils.clamp(this.speed, -7, 24);
      this.heading -= steer * Math.min(Math.abs(this.speed) / 7, 1) * Math.sign(this.speed) * 1.25 * dt;
      const p = this.car.group.position;
      const x = p.x - Math.sin(this.heading) * this.speed * dt;
      const z = p.z - Math.cos(this.heading) * this.speed * dt;
      if (x > -62 && x < 62 && z > 18 && z < 112) p.set(x, 0, z);
      else this.speed = 0;
      this.car.group.rotation.y = this.heading - Math.PI / 2;
      this.item.anchor.set(p.x, 1, p.z);
      Object.assign(this.carCollider, { minX: p.x - 2.3, maxX: p.x + 2.3, minZ: p.z - 2.3, maxZ: p.z + 2.3 });
      camera.position.set(
        p.x + Math.sin(this.heading) * 6,
        3.6,
        Math.max(15.6, p.z + Math.cos(this.heading) * 6),
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
