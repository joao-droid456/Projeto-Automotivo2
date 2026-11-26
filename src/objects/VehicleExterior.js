import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createVehicleCabin } from './VehicleCabin.js';

// Fixed trim is merged locally; hood, wheels and service parts stay independent.
export function createVehicleExterior({ body, trim, metal, glass, fixedWipers = true }) {
  const group = new THREE.Group(); group.name = 'acabamento-exterior';
  const batches = new Map();
  const cabin = createVehicleCabin({ body, trim, glass });
  for (const mesh of cabin.children) {
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh.geometry);
  }
  function box(name, size, position, material = trim, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
    const flat = geometry.toNonIndexed(); geometry.dispose();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(flat);
  }
  for (const side of [-1, 1]) {
    // Separate doors and window seals add definition without dense body meshes.
    box('junta vertical das portas', [0.008, 0.4, 0.009], [0.38, 0.9, side * 0.861]);
    box('junta dianteira da porta', [0.008, 0.34, 0.009], [-0.82, 0.94, side * 0.85]);
    box('junta traseira da porta', [0.008, 0.31, 0.009], [1.06, 0.94, side * 0.85]);
    box('friso inferior da janela', [2.25, 0.025, 0.025], [0.22, 1.2, side * 0.718]);
    box('friso superior da janela', [1.3, 0.025, 0.025], [0.22, 1.677, side * 0.718]);
    box('maçaneta traseira', [0.16, 0.032, 0.035], [0.88, 1.065, side * 0.849], metal);
    box('espelho retrovisor', [0.13, 0.075, 0.009], [-0.68, 1.23, side * 0.91], glass, [0, Math.PI / 2, 0]);
    box('soleira pintada', [1.8, 0.065, 0.055], [0.02, 0.54, side * 0.807], body);
    box('refletor traseiro', [0.012, 0.065, 0.11], [2.1, 0.61, side * 0.62], metal);
  }
  box('fechamento frontal sob os faróis', [0.12, 0.36, 1.52], [-1.91, 0.86, 0], body);
  box('fechamento traseiro sob as lanternas', [0.12, 0.36, 1.52], [1.94, 0.86, 0], body);
  box('grade frontal', [0.022, 0.17, 0.65], [-2.04, 0.91, 0]);
  for (const y of [0.855, 0.9, 0.945]) box('filete da grade', [0.026, 0.012, 0.61], [-2.055, y, 0], metal);
  box('entrada de ar inferior', [0.018, 0.07, 1.02], [-2.105, 0.6, 0]);
  for (const x of [-2.115, 2.105]) {
    box('suporte de placa', [0.018, 0.13, 0.38], [x, 0.73, 0]);
    box('placa neutra', [0.02, 0.085, 0.3], [x + Math.sign(x) * 0.012, 0.73, 0], metal);
  }
  if (fixedWipers) {
    for (const z of [-0.3, 0.3]) {
      box('limpador de para-brisa', [0.012, 0.014, 0.48], [-0.935, 1.24, z], trim, [0, 0.16, 0]);
    }
  }
  box('terceira luz de freio', [0.025, 0.035, 0.28], [1.365, 1.35, 0], metal);
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.name = 'detalhes externos';
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
