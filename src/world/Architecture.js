import * as THREE from 'three';
import { geometryKit } from './GeometryKit.js';

export function buildArchitecture(root, m, collision, config) {
  const { width: w, depth: d, height: eave } = config;
  const r = config.reconstruction;
  const kit = geometryKit(root, collision), { box, repeat, beam } = kit;
  const half = w / 2, ridge = r.ridgeHeight, slot = r.skylightWidth / 2;
  const roofY = x => ridge - Math.abs(x) / half * (ridge - eave);
  box('piso', [w, 0.2, d], [0, -0.1, 0], m.floor);
  // Juntas do concreto. Não há suporte fotográfico para as antigas faixas amarelas.
  for (let z = -d / 2 + 5; z < d / 2; z += 5) repeat([w, 0.002, 0.014], [0, 0.003, z], m.joint);
  repeat([0.014, 0.002, d], [0, 0.003, 0], m.joint);
  box('parede oeste', [0.22, eave, d], [-half, eave / 2, 0], m.wall, true);
  box('rodapé oeste', [0.24, 0.13, d], [-half + 0.01, 0.065, 0], m.skirting);
  const bottom = r.windowBottom, wh = r.windowHeight, top = bottom + wh;
  box('parede leste inferior', [0.22, bottom, d], [half, bottom / 2, 0], m.wall, true);
  box('parede leste superior', [0.22, eave - top, d], [half, (top + eave) / 2, 0], m.wall);
  collision.addBox(half, 0, 0.24, d, 'limite janelas');
  box('rodapé leste', [0.24, 0.13, d], [half - 0.01, 0.065, 0], m.skirting);
  let previous = -d / 2;
  for (const z of r.windowCenters) {
    const edge = z - r.windowWidth / 2, width = r.windowWidth;
    if (edge > previous) box('alvenaria entre janelas', [0.22, wh, edge - previous], [half, bottom + wh / 2, (edge + previous) / 2], m.wall);
    box('peitoril da janela', [0.26, 0.09, width + 0.15], [half - 0.06, bottom - 0.04, z], m.sill);
    for (const dz of [-width / 2, 0, width / 2]) repeat([0.105, wh + 0.09, 0.045], [half - 0.04, bottom + wh / 2, z + dz], m.frame);
    for (const y of [bottom, bottom + wh * 0.72, top]) repeat([0.105, 0.045, width], [half - 0.04, y, z], m.frame);
    box('vidro externo', [0.022, wh - 0.08, width - 0.08], [half + 0.035, bottom + wh / 2, z], m.window);
    previous = z + width / 2;
  }
  if (previous < d / 2) box('alvenaria final das janelas', [0.22, wh, d / 2 - previous], [half, bottom + wh / 2, (d / 2 + previous) / 2], m.wall);
  for (const z of [-d / 2, d / 2]) {
    if (z > 0) {
      const gate = r.gate;
      const left = gate.x - gate.width / 2, right = gate.x + gate.width / 2;
      box('parede à esquerda do portão', [left + half, eave, 0.22], [(left - half) / 2, eave / 2, z], m.wall, true);
      box('parede à direita do portão', [half - right, eave, 0.22], [(right + half) / 2, eave / 2, z], m.wall, true);
      box('parede sobre o portão', [gate.width, eave - gate.height, 0.22], [gate.x, (eave + gate.height) / 2, z], m.wall);
    }
    else {
      // Janela do setor de motores no encontro com a parede branca dos quadros.
      box('parede norte inferior', [w, bottom, 0.22], [0, bottom / 2, z], m.wall, true);
      box('parede norte superior', [w, eave - top, 0.22], [0, (eave + top) / 2, z], m.wall);
      let last = -half;
      for (const x of r.motorWindowCenters) {
        const edge = x - r.motorWindowWidth / 2;
        box('alvenaria norte entre janelas', [edge - last, wh, 0.22], [(last + edge) / 2, bottom + wh / 2, z], m.wall);
        box('vidro do setor de motores', [r.motorWindowWidth - 0.07, wh - 0.06, 0.022], [x, bottom + wh / 2, z], m.window);
        for (const dx of [-r.motorWindowWidth / 2, 0, r.motorWindowWidth / 2]) repeat([0.045, wh, 0.1], [x + dx, bottom + wh / 2, z + 0.04], m.frame);
        for (const y of [bottom, bottom + wh * 0.72, top]) repeat([r.motorWindowWidth, 0.045, 0.1], [x, y, z + 0.04], m.frame);
        box('peitoril norte', [r.motorWindowWidth + 0.12, 0.08, 0.27], [x, bottom - 0.04, z + 0.04], m.sill);
        last = x + r.motorWindowWidth / 2;
      }
      if (last < half) box('alvenaria final norte', [half - last, wh, 0.22], [(half + last) / 2, bottom + wh / 2, z], m.wall);
    }
    const shape = new THREE.Shape(); shape.moveTo(-half, eave); shape.lineTo(0, ridge); shape.lineTo(half, eave); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
    const mesh = new THREE.Mesh(geometry, m.wall); mesh.position.z = z - 0.11; root.add(mesh);
  }
  const gate = r.gate;
  box('portão sólido fechado', [gate.width, gate.height, 0.24], [gate.x, gate.height / 2, d / 2], m.gate);
  collision.addBox(gate.x, d / 2, gate.width, 0.3, 'portao-passagem');
  for (let y = 0.1; y < gate.height; y += 0.25) repeat([gate.width, 0.035, 0.04], [gate.x, y, d / 2 - 0.14], m.frame);
  // Duas águas separadas pela faixa zenital: sem laje plana escondendo a estrutura.
  for (const side of [-1, 1]) {
    const centerX = side * (half + slot) / 2;
    const length = Math.hypot(half - slot, roofY(slot) - eave), angle = -side * Math.atan2(ridge - eave, half);
    box('água da cobertura', [length, 0.07, d], [centerX, roofY(centerX) + 0.04, 0], m.roof, false, [0, 0, angle]);
    for (let x = slot; x < half; x += 0.17) repeat([0.04, 0.024, d], [side * x, roofY(x) - 0.008, 0], m.roofRib, [0, 0, angle]);
    for (let x = 1.4; x < half; x += 1.7) repeat([0.08, 0.12, d], [side * x, roofY(x) - 0.13, 0], m.steel);
  }
  box('faixa zenital translúcida', [slot * 2, 0.035, d], [0, roofY(slot) + 0.08, 0], m.skylight);
  for (let z = -d / 2; z <= d / 2; z += 1.5) repeat([slot * 2 + 0.1, 0.065, 0.045], [0, roofY(slot) - 0.02, z], m.steel);
  for (const x of [-slot, slot]) repeat([0.07, 0.22, d], [x, roofY(slot) - 0.06, 0], m.steel);
  for (const z of r.frameZ) {
    for (const side of [-1, 1]) {
      const x = side * (half - 0.15);
      repeat([0.07, eave, 0.22], [x, eave / 2, z], m.column);
      for (const dx of [-0.13, 0.13]) repeat([0.05, eave, 0.3], [x + dx, eave / 2, z], m.column);
      box('base de pilar', [0.5, 0.04, 0.5], [x, 0.02, z], m.column);
      collision.addBox(x, z, 0.36, 0.36, 'pilar');
      const lowerY = eave - 0.28;
      beam('banzo superior', [side * half, eave - 0.12, z], [side * slot, roofY(slot) - 0.15, z], 0.105, m.steel);
      beam('banzo inferior', [side * half, lowerY, z], [side * slot, roofY(slot) - 0.95, z], 0.09, m.steel);
      for (let i = 0; i < 8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8;
        const px = t => side * (half + (slot - half) * t);
        const topY = t => eave - 0.12 + (roofY(slot) - eave - 0.03) * t;
        const lowY = t => lowerY + (roofY(slot) - 0.95 - lowerY) * t;
        beam('diagonal de treliça', [px(t0), i % 2 ? lowY(t0) : topY(t0), z], [px(t1), i % 2 ? topY(t1) : lowY(t1), z], 0.04, m.steel);
      }
    }
    beam('travessa zenital', [-slot, roofY(slot) - 0.85, z], [slot, roofY(slot) - 0.85, z], 0.065, m.steel);
  }
  kit.flush();
  return { ...kit, roofY };
}
