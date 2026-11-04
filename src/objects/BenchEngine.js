import * as THREE from 'three';

export const engineParts = {
  block: ['Bloco do motor', 'Estrutura que abriga os cilindros e sustenta o conjunto móvel.'],
  head: ['Cabeçote', 'Fecha os cilindros e contém as válvulas de admissão e escape.'],
  cover: ['Tampa de válvulas', 'Protege o comando de válvulas e mantém o óleo no cabeçote.'],
  sump: ['Cárter', 'Reservatório inferior que recolhe o óleo de lubrificação.'],
  piston: ['Pistões e anéis', 'Movem-se nos cilindros; os anéis ajudam a vedar a câmara de combustão.'],
  rod: ['Bielas', 'Ligam os pistões ao virabrequim e transmitem o esforço da combustão.'],
  crank: ['Virabrequim', 'Transforma o movimento alternado dos pistões em rotação.'],
  cam: ['Comando de válvulas', 'Seus ressaltos controlam o momento de abertura das válvulas.'],
  valve: ['Válvulas', 'Controlam a entrada de ar e a saída dos gases dos cilindros.'],
  intake: ['Coletor de admissão', 'Distribui o ar de admissão entre os quatro cilindros.'],
  exhaust: ['Coletor de escape', 'Reúne os gases que saem dos cilindros.'],
  pulley: ['Polia do virabrequim', 'Transmite rotação aos acessórios por meio da correia.'],
  alternator: ['Alternador', 'Converte a rotação do motor em energia elétrica.'],
};

export class BenchEngine {
  constructor(bench) {
    this.group = new THREE.Group();
    this.group.name = 'Motor didático interativo na bancada';
    this.group.userData.dynamic = true;
    this.group.position.set(bench.position[0], bench.size[1] + 0.055, bench.position[2]);
    this.data = { id: 'motor-bancada', name: 'Motor da bancada · abrir e explorar', type: 'bench-engine' };
    this.parts = new Map();
    this.explosion = 0;
    this.phase = 0;
    this.moving = [];
    const material = (color, metalness = 0.65) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.32 });
    const silver = material('#aebbc4'),
      dark = material('#35424e'),
      blue = material('#245b7e');
    const gold = material('#d3a956'),
      red = material('#a55f46');
    const box = size => new THREE.BoxGeometry(...size);
    const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 24);
    const part = (id, geometry, mat, position, parent = this.group) => {
      const mesh = new THREE.Mesh(geometry, mat.clone());
      mesh.position.set(...position);
      mesh.name = engineParts[id][0];
      mesh.userData.enginePart = id;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (!this.parts.has(id)) this.parts.set(id, []);
      this.parts.get(id).push(mesh);
      return mesh;
    };
    // Separate walls leave real cylinder openings and an unobstructed cutaway.
    this.frontWall = part('block', box([1.05, 0.4, 0.055]), blue, [0, 0.53, 0.265]);
    part('block', box([1.05, 0.4, 0.055]), blue, [0, 0.53, -0.265]);
    for (const x of [-0.51, 0.51]) part('block', box([0.055, 0.4, 0.53]), blue, [x, 0.53, 0]);
    this.liners = [];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.245;
      const liner = part('block', new THREE.CylinderGeometry(0.112, 0.112, 0.37, 32, 1, true), silver, [
        x,
        0.53,
        0,
      ]);
      liner.material.side = THREE.DoubleSide;
      this.liners.push(liner);
      const piston = part('piston', cyl(0.096, 0.11), silver, [x, 0.6, 0]);
      for (const y of [0.018, 0.038]) {
        const ring = part('piston', new THREE.TorusGeometry(0.096, 0.003, 6, 32), dark, [0, y, 0], piston);
        ring.rotation.x = Math.PI / 2;
      }
      const rod = part('rod', box([0.038, 1, 0.04]), gold, [x, 0.35, 0]);
      this.moving.push({ piston, rod, x, offset: i === 0 || i === 3 ? 0 : Math.PI });
      for (const z of [-0.075, 0.075]) {
        part('valve', cyl(0.012, 0.15), gold, [x, 0.835, z]);
        part('valve', cyl(0.04, 0.014), silver, [x, 0.76, z]);
      }
    }
    this.crank = part('crank', cyl(0.035, 1.18), gold, [0, 0.24, 0]);
    this.crank.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const weight = part('crank', box([0.13, 0.055, 0.15]), dark, [0.045, (i - 1.5) * 0.245, 0], this.crank);
      weight.rotation.z = (i % 2) * Math.PI;
    }
    this.head = part('head', box([1.09, 0.14, 0.57]), silver, [0, 0.81, 0]);
    this.cover = part('cover', box([1.07, 0.12, 0.42]), dark, [0, 1.035, 0]);
    this.cam = part('cam', cyl(0.025, 1.05), gold, [0, 0.93, 0]);
    this.cam.rotation.z = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const lobe = part('cam', cyl(0.045, 0.035), silver, [0.012, (i - 3.5) * 0.12, 0], this.cam);
      lobe.rotation.y = (i * Math.PI) / 2;
    }
    this.sump = part('sump', box([0.94, 0.17, 0.48]), dark, [0, 0.105, 0]);
    for (const x of [-0.4, 0.4]) {
      const foot = new THREE.Mesh(box([0.12, 0.04, 0.7]), dark);
      foot.position.set(x, 0, 0);
      this.group.add(foot);
    }
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.245;
      for (const [id, side, mat] of [
        ['intake', -1, silver],
        ['exhaust', 1, red],
      ]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, 0.8, side * 0.25),
          new THREE.Vector3(x, 0.74, side * 0.38),
          new THREE.Vector3(x, 0.48, side * 0.38),
        ]);
        part(id, new THREE.TubeGeometry(curve, 12, 0.034, 8, false), mat, [0, 0, 0]);
      }
    }
    const pulley = part('pulley', cyl(0.15, 0.055), dark, [0.62, 0.24, 0]);
    pulley.rotation.z = Math.PI / 2;
    const alternator = part('alternator', cyl(0.105, 0.18), silver, [0.43, 0.48, -0.36]);
    alternator.rotation.z = Math.PI / 2;
    this.anchor = this.group.position.clone().add(new THREE.Vector3(0, 0.6, 0.6));
    this.outline = new THREE.BoxHelper(this.group, '#edc76b');
    this.outline.visible = false;
    this.setExplosion(0);
  }

  setExplosion(amount) {
    this.explosion = THREE.MathUtils.clamp(amount, 0, 1);
    const t = this.explosion;
    this.cover.position.set(0, 1.035 + t * 0.9, 0);
    this.head.position.set(0, 0.81 + t * 0.64, -t * 0.55);
    this.sump.position.set(0, 0.105 - t * 0.18, t * 0.65);
    this.cam.position.y = 0.93 + t * 0.34;
    this.frontWall.position.z = 0.265 + t * 0.62;
    for (const mesh of this.liners) mesh.visible = t < 0.45;
  }

  advance(dt, running = false) {
    if (running) this.phase += dt * 1.8;
    this.crank.rotation.x = this.phase;
    this.cam.rotation.x = this.phase / 2;
    for (const { piston, rod, x, offset } of this.moving) {
      const angle = this.phase + offset;
      const pin = new THREE.Vector3(x, 0.24 + Math.cos(angle) * 0.075, Math.sin(angle) * 0.075);
      const top = new THREE.Vector3(x, 0.24 + Math.cos(angle) * 0.075 + Math.sqrt(0.29 ** 2 - pin.z ** 2), 0);
      piston.position.copy(top);
      rod.position.copy(pin).lerp(top, 0.5);
      rod.scale.y = pin.distanceTo(top);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.sub(pin).normalize());
    }
  }
  setHighlight(value) {
    this.outline.visible = value;
    if (value) this.outline.update();
  }
  update() {}
}
