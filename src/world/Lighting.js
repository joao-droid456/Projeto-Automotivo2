import * as THREE from 'three';

export function createLighting(scene, kit, m, config) {
  const { box, repeat, pipe } = kit;
  const hemi = new THREE.HemisphereLight('#e6ecec', '#8f8a7e', 1.65); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#f1eee4', 2.5);
  sun.position.set(18, 11, -7); sun.target.position.set(0, 0, -3); sun.castShadow = false;
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 21, bottom: -21, near: 0.5, far: 55 });
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.018; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, sun.target);
  for (const x of [-7.2, 0.1, 5.3]) for (const z of [-11.5, -5.6, 0.3, 6.2, 12.1]) {
    const y = x < -5 ? 4.65 : 4.9;
    box('refletor branco de luminária', [0.28, 0.055, 1.75], [x, y, z], m.frame);
    for (const side of [-1, 1]) {
      repeat([0.025, 0.08, 1.75], [x + side * 0.15, y - 0.025, z], m.paper);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.66, 8), m.lamp);
      tube.rotation.x = Math.PI / 2; tube.position.set(x + side * 0.065, y - 0.045, z); kit.root.add(tube);
    }
    for (const dz of [-0.64, 0.64]) pipe('cabo de suspensão', [[x, y + 0.03, z + dz], [x, kit.roofY(x) - 0.15, z + dz]], 0.0035, m.dark);
  }
  // Preenchimento localizado, sem multiplicar luzes com sombras por luminária.
  const fill = new THREE.PointLight('#e3e9e5', 38, 18, 2); fill.position.set(4.5, 4.7, -6); scene.add(fill);
  const secondary = new THREE.PointLight('#e3e9e5', 30, 16, 2); secondary.position.set(4.5, 4.7, 8); scene.add(secondary);
  return { hemi, sun, fill, secondary };
}
