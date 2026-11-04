import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Local coordinates match Vehicle: front -X, driver +Z, floor at Y=.7. */
export function createVehicleInterior() {
  const root = new THREE.Group();
  root.name = 'interior-do-veiculo';
  root.userData.vehicleInterior = true;
  const material = (color, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const fabric = material('#4e5965'),
    trim = material('#222b33'),
    stitch = material('#82919c');
  const metal = material('#a0b0bc', 0.32, 0.7);
  const display = new THREE.MeshStandardMaterial({
    color: '#98dce5',
    emissive: '#4fabbc',
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });
  const batches = new Map();
  const interiorMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.08,
  });
  function add(id, geometry, mat, position, rotation = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const colors = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) mat.color.toArray(colors, i);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!batches.has(interiorMaterial)) batches.set(interiorMaterial, []);
    batches.get(interiorMaterial).push({ id, geometry: flat });
  }
  const box = (id, size, position, mat = trim, rotation = [0, 0, 0]) =>
    add(id, new THREE.BoxGeometry(...size), mat, position, rotation);
  box('cabin-floor', [2.14, 0.06, 1.38], [0.16, 0.705, 0]);
  for (const z of [-0.36, 0.36]) {
    box('front-seat', [0.57, 0.13, 0.52], [-0.02, 0.83, z], fabric);
    box('front-seat', [0.12, 0.47, 0.53], [0.24, 1.08, z], fabric, [0, 0, -0.13]);
    box('headrest', [0.115, 0.16, 0.29], [0.28, 1.42, z], fabric);
    for (const dz of [-0.1, 0.1]) box('headrest', [0.018, 0.08, 0.018], [0.27, 1.315, z + dz], metal);
    for (const dz of [-0.22, 0.22]) box('front-seat', [0.47, 0.055, 0.055], [-0.03, 0.91, z + dz], stitch);
    for (const x of [-0.23, 0.1])
      box('seat-belt', [0.05, 0.07, 0.035], [x, 0.93, z - Math.sign(z) * 0.24], metal);
    box('seat-belt', [0.032, 0.46, 0.016], [0.29, 1.09, z + Math.sign(z) * 0.23], trim, [
      0.23 * Math.sign(z),
      0,
      0,
    ]);
  }
  box('rear-seat', [0.43, 0.14, 1.24], [0.82, 0.85, 0], fabric);
  box('rear-seat', [0.12, 0.43, 1.24], [1.035, 1.09, 0], fabric, [0, 0, -0.12]);
  for (const z of [-0.43, 0, 0.43]) box('headrest', [0.11, 0.15, 0.23], [1.06, 1.38, z], fabric);
  box('dashboard', [0.35, 0.2, 1.34], [-0.72, 1.09, 0]);
  box('dashboard', [0.12, 0.23, 0.47], [-0.54, 0.91, 0.41]);
  box('instrument-panel', [0.025, 0.135, 0.35], [-0.532, 1.17, 0.38]);
  for (const z of [0.29, 0.46]) {
    add(
      'instrument-panel',
      new THREE.CircleGeometry(0.046, 12),
      display,
      [-0.516, 1.18, z],
      [0, Math.PI / 2, 0],
    );
    box('instrument-panel', [0.006, 0.03, 0.005], [-0.509, 1.19, z], metal, [0.35, 0, 0]);
  }
  add(
    'steering-wheel',
    new THREE.TorusGeometry(0.135, 0.016, 6, 16),
    trim,
    [-0.38, 1.16, 0.39],
    [0, Math.PI / 2, 0],
  );
  box('steering-wheel', [0.04, 0.065, 0.12], [-0.38, 1.16, 0.39]);
  box('steering-wheel', [0.022, 0.025, 0.23], [-0.38, 1.16, 0.39], metal);
  box('steering-wheel', [0.022, 0.13, 0.022], [-0.38, 1.1, 0.39], metal);
  box('center-console', [0.81, 0.12, 0.2], [-0.13, 0.8, 0]);
  box('gear-lever', [0.025, 0.16, 0.025], [-0.27, 0.93, 0], metal);
  box('gear-lever', [0.07, 0.045, 0.065], [-0.27, 1.025, 0]);
  box('handbrake', [0.21, 0.04, 0.035], [0.05, 0.9, 0.06], trim, [0, 0, -0.2]);
  box('infotainment', [0.02, 0.105, 0.21], [-0.53, 1.12, 0], display);
  for (const z of [-0.51, -0.24, 0.1, 0.59]) {
    box('air-vent', [0.022, 0.06, 0.11], [-0.53, 1.15, z]);
    for (const y of [1.135, 1.15, 1.165]) box('air-vent', [0.025, 0.006, 0.09], [-0.514, y, z], metal);
  }
  for (const z of [0.29, 0.4, 0.52])
    box('pedals', [0.075, 0.025, 0.055], [-0.62, 0.77, z], metal, [0, 0, 0.25]);
  for (const z of [-0.675, 0.675]) {
    for (const x of [-0.22, 0.73]) {
      box('door-trim', [0.78, 0.29, 0.032], [x, 0.95, z], fabric);
      box('door-trim', [0.36, 0.045, 0.065], [x, 0.96, z - Math.sign(z) * 0.025]);
      box('door-trim', [0.13, 0.025, 0.035], [x - 0.16, 1.035, z - Math.sign(z) * 0.025], metal);
    }
  }
  box('rearview-mirror', [0.025, 0.07, 0.2], [-0.56, 1.51, 0], metal);
  for (const [mat, entries] of batches) {
    const geometry = mergeGeometries(
      entries.map(entry => entry.geometry),
      false,
    );
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = 'componentes-do-interior';
    let offset = 0;
    mesh.userData.inspectionFaces = entries.map(({ id, geometry: part }) => {
      const start = offset;
      offset += part.attributes.position.count / 3;
      part.dispose();
      return { id, start, end: offset };
    });
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  for (const mat of [fabric, trim, stitch, metal, display]) mat.dispose();
  return root;
}
