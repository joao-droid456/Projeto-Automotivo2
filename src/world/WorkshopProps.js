import * as THREE from 'three';
import { BenchEngine } from '../objects/BenchEngine.js';
import { PartsDisplay } from '../objects/PartsDisplay.js';
import { Vehicle } from '../objects/Vehicle.js';
import { VehicleLift } from '../objects/VehicleLift.js';
import { batchStaticWorld } from './StaticBatching.js';

export function buildWorkshopProps(root, kit, m, collision, config, coveredVehicles = []) {
  const { box, repeat, beam, pipe } = kit, r = config.reconstruction;
  const lifts = [];
  root.userData.rearDisplays = [];
  const wheels = new THREE.CylinderGeometry(0.055, 0.055, 0.035, 10);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  function cylinder(name, radius, length, pos, material, axis = 'y') {
    const mesh = new THREE.Mesh(cylinderGeo, material); mesh.name = name; mesh.scale.set(radius, length, radius); mesh.position.set(...pos);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2; if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.static = true; root.add(mesh); return mesh;
  }
  function caster(x, z) {
    const mesh = new THREE.Mesh(wheels, m.rubber); mesh.rotation.z = Math.PI / 2; mesh.position.set(x, 0.057, z); mesh.castShadow = true; mesh.userData.static = true; root.add(mesh);
    repeat([0.035, 0.08, 0.035], [x, 0.105, z], m.metal);
  }
  function bench(position, size, drawers = false) {
    const [x, , z] = position, [w, h, d] = size;
    box('bancada de referência — aproximada', [w, 0.07, d], [x, h, z], m.worktop);
    box('volume de colisão da bancada', [0.001, 0.001, 0.001], [x, 0.3, z], m.dark).visible = false;
    collision.addBox(x, z, w, d, 'bancada de referência');
    for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) box('pé quadrado de bancada', [0.07, h, 0.07], [x + dx, h / 2, z + dz], m.sill);
    box('prateleira de bancada', [w - 0.1, 0.04, d - 0.08], [x, 0.24, z], m.sill);
    if (drawers) {
      box('caixa do gaveteiro', [w * 0.45, h * 0.65, d - 0.13], [x + w / 4, h * 0.57, z], m.sill);
      for (let i = 0; i < 3; i++) {
        box('frente de gaveta', [w * 0.43, 0.14, 0.025], [x + w / 4, 0.38 + i * 0.18, z + d / 2], m.lowerWall);
        box('puxador de gaveta', [0.22, 0.035, 0.04], [x + w / 4, 0.42 + i * 0.18, z + d / 2 + 0.035], m.metal);
      }
    }
  }
  r.benches.forEach((b, i) => bench(b.position, b.size, true));
  // Bancada azul/cinza contínua junto à face do laboratório, foto 7.
  const lab = r.lab, sideX = lab.center[0] + lab.size[0] / 2 + 0.48;
  box('bancada lateral azul', [0.78, 0.055, 6], [sideX, 0.92, lab.center[2] + 0.7], m.worktop);
  collision.addBox(sideX, lab.center[2] + 0.7, 0.8, 6, 'armários laboratório');
  for (let z = lab.center[2] - 2.1; z < lab.center[2] + 3.6; z += 0.75) {
    box('módulo azul', [0.7, 0.78, 0.72], [sideX, 0.45, z], m.blue);
    box('porta cinza de armário baixo', [0.025, 0.67, 0.62], [sideX + 0.37, 0.46, z], m.lowerWall);
    box('puxador lateral', [0.05, 0.18, 0.025], [sideX + 0.4, 0.5, z - 0.22], m.frame);
  }
  // Silhuetas dos conjuntos em cavaletes: peças não identificadas, sem função inventada.
  for (const { position: [x, , z], variant } of r.engineStands) {
    const standMaterial = variant === 2 ? m.red : m.green;
    box('base de cavalete de motor', [0.9, 0.055, 0.78], [x, 0.15, z], m.sill);
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.29, 0.29]) caster(x + dx, z + dz);
    box('coluna de cavalete', [0.13, 0.88, 0.13], [x + 0.21, 0.62, z], standMaterial);
    beam('escora do cavalete', [x + 0.21, 0.2, z + 0.24], [x + 0.21, 0.72, z], 0.055, standMaterial);
    cylinder('cabeçote giratório do suporte', 0.09, 0.3, [x + 0.12, 1.08, z], standMaterial, 'x');
    const motor = new BenchEngine({ position: [x - 0.1, 0, z], size: [1, 0.7, 1] });
    motor.data.id = 'motor-fundo-' + (root.userData.rearDisplays.length + 1);
    motor.data.name = 'Motor no cavalete · explorar componentes';
    root.add(motor.group);
    root.userData.rearDisplays.push(motor);
    collision.addBox(x, z, 0.98, 0.95, 'conjunto em suporte');
  }
  // Dois postos de elevação visíveis nas fotos 6/7. Apenas cenográficos.
  for (const { position: [x, , z], color, oilProfile } of r.lifts) {
    const moving = new THREE.Group(); root.add(moving);
    const colliders = [];
    for (const side of [-1, 1]) {
      const px = x + side * 1.57;
      box('base de elevador azul', [0.58, 0.065, 0.7], [px, 0.035, z], m.liftBlue);
      box('coluna de elevador azul', [0.27, 3.28, 0.33], [px, 1.7, z], m.liftBlue, true);
      box('capa superior do elevador', [0.52, 0.15, 0.48], [px, 3.39, z], m.liftBlue);
      box('guia metálica do elevador', [0.035, 2.7, 0.06], [px - side * 0.16, 1.65, z], m.metal);
      for (const direction of [-1, 1]) {
        const arm = box('braço recolhido do elevador', [1.0, 0.09, 0.15], [px - side * 0.45, 0.16, z + direction * 0.5], m.liftBlue);
        arm.rotation.y = side * direction * 0.5;
        moving.attach(arm);
        const pad = box('apoio de borracha do elevador', [0.18, 0.15, 0.22], [x + side * 0.72, 0.28, z + direction * 0.72], m.rubber);
        moving.attach(pad);
        colliders.push(collision.addBox(px - side * 0.45, z + direction * 0.5, 0.95, 0.65, 'braço baixo do elevador'));
      }
    }
    const car = new Vehicle([x, 0, z], { color, displayOnly: true, serviceable: true });
    // Consolidate within the car: batches then travel with the lift instead
    // of becoming hundreds of separate draws or being baked into the room.
    batchStaticWorld(car.group);
    car.group.rotation.y = Math.PI / 2; root.add(car.group);
    moving.attach(car.group);
    moving.traverse(o => { o.userData.static = false; });
    moving.userData.dynamic = true;
    const button = box('bot?o do elevador', [0.22, 0.22, 0.12], [x - 1.57, 1.22, z + 0.25], m.green.clone());
    button.userData.static = false;
    colliders.push(collision.addBox(x, z, 2.02, 4.3, 'veículo claro aproximado'));
    const lift = new VehicleLift(lifts.length + 1, moving, button, colliders, config.eyeHeight + 0.1); lifts.push(lift);
    lift.vehicle = car;
    lift.oilProfile = oilProfile || (lifts.length === 1 ? 'corolla' : 'hb20');
    lift.vehicleCentered = true; lift.supportsLocked = true; lift.engineOff = true;
    // Carrinho didático creme em primeiro plano, foto 6.
    const cabinetZ = z - 3.4;
    box('armário didático creme', [1.05, 1.5, 0.5], [x + 0.25, 0.86, cabinetZ], m.cream, true);
    box('interior escuro do armário', [0.82, 1.19, 0.018], [x + 0.25, 0.88, cabinetZ + 0.26], m.dark);
    box('vidro do armário', [0.85, 1.24, 0.018], [x + 0.25, 0.88, cabinetZ + 0.29], m.interiorGlass);
    for (let i = 0; i < 5; i++) {
      box('componente de painel não identificado', [0.12, 0.12, 0.08], [x - 0.05 + i % 3 * 0.24, 0.55 + Math.floor(i / 3) * 0.5, cabinetZ + 0.3], m.frame);
      pipe('cabo do painel didático', [[x - 0.05 + i % 3 * 0.24, 0.55 + Math.floor(i / 3) * 0.5, cabinetZ + 0.32], [x - 0.11 + i % 3 * 0.24, 0.35, cabinetZ + 0.33]], 0.005, i % 2 ? m.red : m.yellow);
    }
    for (const dx of [-0.4, 0.4]) for (const dz of [-0.18, 0.18]) caster(x + 0.25 + dx, cabinetZ + dz);
  }
  for (const c of r.coveredCars) {
    const cover = coveredCar(c.length, m.cover, m.rubber); cover.position.fromArray(c.position); root.add(cover);
    cover.userData.inspectionPart = 'cover';
    coveredVehicles.push({ id: `coberto-${coveredVehicles.length + 1}`, name: `Veículo coberto ${coveredVehicles.length + 1}`, root: cover, inspectionModel: c.inspectionModel });
    collision.addBox(c.position[0], c.position[2], 2.02, c.length, 'veículo coberto');
  }
  // Prateleira verde e ventilador, confirmados em 1/11.
  const shelfX = -0.25, shelfZ = -14.42;
  for (const x of [shelfX - 0.7, shelfX + 0.7]) for (const z of [shelfZ - 0.22, shelfZ + 0.22]) repeat([0.035, 1.8, 0.035], [x, 0.92, z], m.green);
  const storedParts = [];
  for (const y of [0.18, 0.7, 1.2, 1.75]) {
    box('prateleira verde', [1.45, 0.04, 0.53], [shelfX, y, shelfZ], m.green);
    if (y < 1.7) for (let i = 0; i < 4; i++) storedParts.push(cylinder('componente guardado aproximado', 0.09, 0.13, [shelfX - 0.5 + i * 0.32, y + 0.1, shelfZ], m.metal, 'z'));
  }
  root.userData.rearDisplays.push(new PartsDisplay(root, storedParts));
  collision.addBox(shelfX, shelfZ, 1.5, 0.6, 'estante verde');
  const fan = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.008, 6, 40), m.dark); fan.position.set(shelfX, 2.5, -14.7); root.add(fan);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI;
    beam('grade de ventilador', [shelfX - Math.sin(angle) * 0.26, 2.5 - Math.cos(angle) * 0.26, -14.71], [shelfX + Math.sin(angle) * 0.26, 2.5 + Math.cos(angle) * 0.26, -14.71], 0.006, m.frame);
  }
  for (let i = 0; i < 3; i++) { const blade = box('pá de ventilador', [0.1, 0.24, 0.025], [shelfX + Math.sin(i * Math.PI * 2 / 3) * 0.11, 2.5 + Math.cos(i * Math.PI * 2 / 3) * 0.11, -14.68], m.dark); blade.rotation.z = -i * Math.PI * 2 / 3; }
  // Quadro de armazenamento de persiana, foto 14. Sem copiar material institucional.
  box('moldura azul da persiana', [0.12, 1.0, 2.2], [9.8, 2.3, -9.0], m.blue);
  box('fundo da persiana', [0.07, 0.86, 2.04], [9.72, 2.3, -9.0], m.frame);
  for (let y = 1.91; y < 2.7; y += 0.085) repeat([0.05, 0.035, 2.02], [9.66, y, -9.0], m.metal);
  for (const z of [-11.3, -12.6]) {
    box('moldura de quadro técnico', [0.04, 0.7, 0.85], [9.85, 2.35, z], m.frame);
    box('quadro técnico — grafismo aproximado', [0.02, 0.63, 0.78], [9.81, 2.35, z], m.paper);
    for (let i = 0; i < 5; i++) repeat([0.005, 0.012, 0.55], [9.79, 2.13 + i * 0.1, z], m.blue);
  }
  // Tubulações altas e descidas identificadas, não percursos de rede certificados.
  for (const [y, material, radius] of [[4.65, m.yellow, 0.043], [4.28, m.red, 0.05], [4.45, m.turquoise, 0.018]]) {
    pipe('tubulação longitudinal leste', [[9.76, y, -14.7], [9.76, y, 14.7]], radius, material);
    pipe('tubulação sobre janelas dos motores', [[-0.15, y, -14.76], [9.76, y, -14.76]], radius, material);
  }
  for (const x of [0.05, 3.25, 6.55]) pipe('descida amarela do setor de motores', [[x, 4.65, -14.74], [x, 3.97, -14.74], [x, 3.78, -14.6], [x, 1.4, -14.6]], 0.03, m.yellow);
  for (const z of [-10.1, -2.5, 6.8]) pipe('descida amarela com desvio', [[9.74, 4.65, z], [9.74, 3.97, z], [9.6, 3.78, z], [9.6, 1.4, z]], 0.03, m.yellow);
  box('eletrocalha leste', [0.3, 0.045, config.depth - 0.6], [9.7, 4.03, 0], m.frame);
  for (let z = -14.7; z < 14.7; z += 0.16) repeat([0.32, 0.06, 0.025], [9.7, 4.06, z], m.frame);
  for (const z of [-11, 0, 10]) {
    box('eletrocalha transversal', [config.width - 0.5, 0.045, 0.25], [0, 4.55, z], m.frame);
    for (let x = -9.5; x < 9.5; x += 0.16) repeat([0.025, 0.06, 0.27], [x, 4.58, z], m.frame);
  }
  return lifts;
}

export function coveredCar(length, material, wheelMaterial) {
  // Superfície tridimensional com silhueta e dobras, sem fotografia aplicada num plano.
  const g = new THREE.Group(), rows = 38, cols = 26, positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, z = (t - 0.5) * length;
    const roof = 0.78 + 0.82 * Math.exp(-Math.pow((t - 0.51) / 0.25, 4));
    const width = 0.85 + 0.1 * Math.sin(Math.PI * t);
    for (let j = 0; j <= cols; j++) {
      const a = j / cols * Math.PI;
      const fold = Math.sin(i * 1.8 + j * 1.4) * 0.014 + Math.cos(j * 2.2) * 0.01;
      positions.push(Math.cos(a) * (width + fold), 0.09 + (roof - 0.09) * Math.pow(Math.sin(a), 0.42) + fold, z);
      if (i < rows && j < cols) { const k = i * (cols + 1) + j; indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const cloth = new THREE.Mesh(geometry, material); cloth.name = 'capa de veículo — volume aproximado'; cloth.castShadow = cloth.receiveShadow = true; g.add(cloth);
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape(); shape.moveTo(-0.84, 0.08); shape.quadraticCurveTo(-0.8, 0.8, 0, 0.79); shape.quadraticCurveTo(0.8, 0.8, 0.84, 0.08); shape.closePath();
    const end = new THREE.Mesh(new THREE.ShapeGeometry(shape), material); end.position.z = side * length / 2; if (side < 0) end.rotation.y = Math.PI; end.castShadow = true; g.add(end);
  }
  const tireGeometry = new THREE.CylinderGeometry(0.31, 0.31, 0.16, 20);
  for (const side of [-1, 1]) for (const z of [-length * 0.3, length * 0.3]) {
    const wheel = new THREE.Mesh(tireGeometry, wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 0.84, 0.31, z); wheel.castShadow = true; g.add(wheel);
    wheel.userData.inspectionPart = 'tire';
  }
  return g;
}
