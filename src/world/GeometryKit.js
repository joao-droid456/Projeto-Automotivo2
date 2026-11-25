import * as THREE from 'three';

export function geometryKit(root, collision) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), batches = new Map();
  function box(name, size, position, material, solid = false, rotation = null) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.scale.set(...size); mesh.position.set(...position); if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.static = true; root.add(mesh);
    if (solid) collision.addBox(position[0], position[2], size[0], size[2], name);
    return mesh;
  }
  function repeat(size, position, material, rotation = [0, 0, 0]) {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push({ size, position, rotation });
  }
  function beam(name, start, end, thickness, material) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
    const mesh = box(name, [thickness, delta.length(), thickness], a.add(b).multiplyScalar(0.5).toArray(), material);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  function pipe(name, points, radius, material) {
    const path = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 5, radius, 8, false), material);
    mesh.name = name; mesh.castShadow = true; mesh.userData.static = true; root.add(mesh); return mesh;
  }
  function flush() {
    const dummy = new THREE.Object3D();
    for (const [material, items] of batches) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length); mesh.name = 'detalhes repetidos'; mesh.castShadow = mesh.receiveShadow = true;
      items.forEach(({ size, position, rotation }, i) => { dummy.position.set(...position); dummy.scale.set(...size); dummy.rotation.set(...rotation); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.computeBoundingSphere(); root.add(mesh);
    }
    batches.clear();
  }
  return { root, box, repeat, beam, pipe, flush };
}
