import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TRACK = { centerZ: 82, outerX: 62, outerZ: 64, innerX: 54, innerZ: 56, corner: 16 };
const FENCE = { minX: -70, maxX: 70, minZ: 15, maxZ: 146 };

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function groundTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6f8c53'; ctx.fillRect(0, 0, size, size);
  const random = seeded(9137);
  for (let i = 0; i < 4200; i++) {
    const shade = 58 + Math.round(random() * 52);
    ctx.fillStyle = `rgb(${shade - 12},${shade + 22},${shade - 26})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 2 + random() * 4);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function asphaltTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#565b5b'; ctx.fillRect(0, 0, size, size);
  const random = seeded(4471);
  for (let i = 0; i < 5200; i++) {
    const v = 62 + Math.round(random() * 46);
    ctx.fillStyle = `rgb(${v},${v + 1},${v})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = '#3d414144'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(random() * size, random() * size); ctx.lineTo(random() * size, random() * size); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function checkerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e6db'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#23282a'; ctx.fillRect(0, 0, 64, 64); ctx.fillRect(64, 64, 64, 64);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f3b3f'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#d8b36a'; ctx.lineWidth = 5; ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#f0e7cf'; ctx.font = 'bold 46px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 470);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedRect(hx, hz, radius) {
  const s = new THREE.Shape();
  s.moveTo(-hx + radius, -hz);
  s.lineTo(hx - radius, -hz);
  s.quadraticCurveTo(hx, -hz, hx, -hz + radius);
  s.lineTo(hx, hz - radius);
  s.quadraticCurveTo(hx, hz, hx - radius, hz);
  s.lineTo(-hx + radius, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - radius);
  s.lineTo(-hx, -hz + radius);
  s.quadraticCurveTo(-hx, -hz, -hx + radius, -hz);
  return s;
}

/** SDF aproximado de retângulo arredondado; negativo dentro. */
function roundedSdf(x, z, hx, hz, radius) {
  const qx = Math.abs(x) - (hx - radius);
  const qz = Math.abs(z - TRACK.centerZ) - (hz - radius);
  return Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - radius;
}

function paint(geometry, color) {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function treeGeometry() {
  // O tronco é indexado e as copas não; igualar os atributos permite mesclar em um só desenho.
  const trunk = paint(new THREE.CylinderGeometry(0.16, 0.28, 2.7, 6).toNonIndexed().translate(0, 1.35, 0), '#66503a');
  const crownA = paint(new THREE.IcosahedronGeometry(1.75, 0).translate(0, 3.5, 0), '#466b39');
  const crownB = paint(new THREE.IcosahedronGeometry(1.25, 0).translate(0.6, 4.5, 0.2), '#568046');
  const crownC = paint(new THREE.IcosahedronGeometry(1.05, 0).translate(-0.6, 4.2, -0.3), '#3c6033');
  return mergeGeometries([trunk, crownA, crownB, crownC], false);
}

function addInstanced(root, geometry, material, transforms, { colors = null, name = '' } = {}) {
  if (!transforms.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  transforms.forEach((t, i) => {
    dummy.position.set(t.x, t.y ?? 0, t.z);
    dummy.rotation.set(0, t.rotation ?? 0, 0);
    dummy.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) mesh.setColorAt(i, color.set(colors[i % colors.length]));
  });
  mesh.computeBoundingSphere();
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.userData.static = false;
  root.add(mesh);
  return mesh;
}

export function createOutdoorArea(scene, collision, config) {
  const gate = config.reconstruction.gate;
  const spawn = config.driving?.spawn ?? [gate.x, 34];
  const root = new THREE.Group(); root.name = 'pátio externo — pista e área verde'; scene.add(root);
  const backdrop = new THREE.Group(); backdrop.name = 'horizonte externo'; scene.add(backdrop);
  const random = seeded(20261125);

  const grass = groundTexture(); grass.repeat.set(70, 70);
  const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ map: grass, color: '#d7ddc9', roughness: 1 }));
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, -0.045, 60);
  backdrop.add(outerGround);

  const trackMap = asphaltTexture(); trackMap.repeat.set(0.085, 0.085);
  const trackMaterial = new THREE.MeshStandardMaterial({ map: trackMap, roughness: 0.96, metalness: 0 });
  const roadMap = asphaltTexture(); roadMap.repeat.set(1.2, 3.4);
  const roadMaterial = new THREE.MeshStandardMaterial({ map: roadMap, color: '#d8d8d4', roughness: 0.95 });

  const outer = roundedRect(TRACK.outerX, TRACK.outerZ, TRACK.corner);
  const inner = roundedRect(TRACK.innerX, TRACK.innerZ, TRACK.corner);
  outer.holes.push(new THREE.Path(inner.getPoints(64).reverse()));
  const trackGeometry = new THREE.ShapeGeometry(outer, 28);
  trackGeometry.rotateX(-Math.PI / 2);
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.name = 'pista asfáltica'; track.position.set(0, 0.03, TRACK.centerZ);
  track.receiveShadow = false;
  root.add(track);

  // Acesso entre o portão e o paddock.
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), roadMaterial);
  drive.rotation.x = -Math.PI / 2; drive.position.set(gate.x, 0.045, 25);
  root.add(drive);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), roadMaterial);
  pad.rotation.x = -Math.PI / 2; pad.position.set(gate.x, 0.047, 40.5);
  root.add(pad);

  const paintMaterial = new THREE.MeshStandardMaterial({ color: '#e7e3d6', roughness: 0.8 });
  addInstanced(root, new THREE.BoxGeometry(1, 1, 1), paintMaterial, [
    { x: gate.x - 6.5, y: 0.056, z: 34, sx: 0.16, sy: 0.012, sz: 13 },
    { x: gate.x + 6.5, y: 0.056, z: 34, sx: 0.16, sy: 0.012, sz: 13 },
    { x: gate.x, y: 0.056, z: 34.4, sx: 12.8, sy: 0.012, sz: 0.16 },
    { x: gate.x, y: 0.056, z: 47, sx: 12.8, sy: 0.012, sz: 0.16 },
    { x: gate.x, y: 0.056, z: 38.5, sx: 5.4, sy: 0.012, sz: 0.12, rotation: Math.PI / 2 },
    { x: gate.x, y: 0.056, z: 42.5, sx: 5.4, sy: 0.012, sz: 0.12, rotation: Math.PI / 2 },
  ], { name: 'faixas do paddock' });

  const checker = checkerTexture(); checker.repeat.set(1, 7);
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(2, 10), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.85 }));
  startLine.rotation.x = -Math.PI / 2; startLine.position.set(0, 0.052, TRACK.centerZ - 59);
  root.add(startLine);

  // Zebras nas bordas internas, subdivididas em blocos curtos com cor alternada.
  const innerWorld = inner.getPoints(120).map(p => ({ x: p.x, z: TRACK.centerZ - p.y }));
  const curbs = [];
  for (let i = 0; i < innerWorld.length - 1; i++) {
    const a = innerWorld[i], b = innerWorld[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const count = Math.max(1, Math.round(length / 1.5));
    const rotation = Math.atan2(dx, dz);
    for (let j = 0; j < count; j++) {
      const t = (j + 0.5) / count;
      curbs.push({
        x: a.x + dx * t, y: 0.048, z: a.z + dz * t,
        sx: 1.15, sy: 0.055, sz: length / count, rotation,
      });
    }
  }
  addInstanced(root, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), curbs, { colors: ['#c54135', '#e8e2d2'], name: 'zebras da pista' });

  // Cerca perimetral e colisões; o vão do portão permanece livre.
  const wood = new THREE.MeshStandardMaterial({ color: '#7b6448', roughness: 0.9 });
  const fenceLines = [
    [[FENCE.minX, FENCE.minZ], [FENCE.minX, FENCE.maxZ]],
    [[FENCE.maxX, FENCE.minZ], [FENCE.maxX, FENCE.maxZ]],
    [[FENCE.minX, FENCE.maxZ], [FENCE.maxX, FENCE.maxZ]],
    [[FENCE.minX, FENCE.minZ], [-16, FENCE.minZ]],
    [[-1, FENCE.minZ], [FENCE.maxX, FENCE.minZ]],
  ];
  const posts = [], rails = [];
  for (const [[x0, z0], [x1, z1]] of fenceLines) {
    const length = Math.hypot(x1 - x0, z1 - z0), count = Math.max(1, Math.round(length / 3.4));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      posts.push({ x: x0 + (x1 - x0) * t, y: 0.8, z: z0 + (z1 - z0) * t, sx: 0.13, sy: 1.6, sz: 0.13 });
    }
    for (const y of [0.55, 1.18]) {
      rails.push({
        x: (x0 + x1) / 2, y, z: (z0 + z1) / 2,
        sx: 0.07, sy: 0.09, sz: length,
        rotation: Math.atan2(x1 - x0, z1 - z0),
      });
    }
    collision.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.max(Math.abs(x1 - x0), 0.4), Math.max(Math.abs(z1 - z0), 0.4), 'cerca do pátio');
  }
  addInstanced(root, new THREE.BoxGeometry(1, 1, 1), wood, posts, { name: 'mourões da cerca' });
  addInstanced(root, new THREE.BoxGeometry(1, 1, 1), wood, rails, { name: 'travessas da cerca' });

  // Vegetação: infield, entorno da pista e linha de árvores distante.
  const trees = [];
  const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const blockedSpot = (x, z, radius) => {
    if (Math.abs(x - gate.x) < 8.5 && z > 12 && z < 49) return true;
    if (z > 19 && z < 47 && Math.abs(x - gate.x) < 7.5) return true;
    return Math.hypot(x - spawn[0], z - spawn[1]) < radius;
  };
  const clearOfTrack = (x, z, margin) => {
    const o = roundedSdf(x, z, TRACK.outerX, TRACK.outerZ, TRACK.corner);
    const i = roundedSdf(x, z, TRACK.innerX, TRACK.innerZ, TRACK.corner);
    return o > margin || i < -margin;
  };
  for (let attempt = 0; attempt < 1400 && trees.length < 60; attempt++) {
    const infield = trees.length < 14;
    const x = infield ? (random() * 2 - 1) * 46 : (random() < 0.5 ? -1 : 1) * (60 + random() * 30);
    const z = infield ? 34 + random() * 90 : 20 + random() * 136;
    if (blockedSpot(x, z, 9)) continue;
    if (Math.abs(x) > 92 || z > 158) continue;
    const allowed = infield
      ? roundedSdf(x, z, TRACK.innerX, TRACK.innerZ, TRACK.corner) < -6
      : roundedSdf(x, z, TRACK.outerX, TRACK.outerZ, TRACK.corner) > 4.5;
    if (!allowed || !clearOfTrack(x, z, 3)) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    const s = 0.8 + random() * 0.85;
    trees.push({ x, z, s, sy: s * (0.9 + random() * 0.35), rotation: random() * Math.PI * 2 });
    collision.addBox(x, z, 1.0, 1.0, 'árvore do pátio');
  }
  addInstanced(root, treeGeometry(), treeMaterial, trees, { name: 'árvores do pátio' });

  const bushes = [];
  const bushGeometry = new THREE.IcosahedronGeometry(0.72, 0).scale(1, 0.72, 1);
  const bushMaterial = new THREE.MeshStandardMaterial({ color: '#5c8444', flatShading: true, roughness: 1 });
  for (let attempt = 0; attempt < 1400 && bushes.length < 120; attempt++) {
    const x = (random() * 2 - 1) * 66;
    const z = 17 + random() * 126;
    if (blockedSpot(x, z, 7) || Math.abs(x) > FENCE.maxX - 1.5 || z > FENCE.maxZ - 1.5) continue;
    const o = roundedSdf(x, z, TRACK.outerX, TRACK.outerZ, TRACK.corner);
    const i = roundedSdf(x, z, TRACK.innerX, TRACK.innerZ, TRACK.corner);
    const nearOuter = o > 1.2 && o < 9;
    const nearInner = i < -1.2 && i > -9;
    if (!nearOuter && !nearInner) continue;
    if (bushes.some(b => Math.hypot(b.x - x, b.z - z) < 2.6)) continue;
    bushes.push({ x, z, s: 0.6 + random() * 1.1, sy: 0.5 + random() * 0.9, rotation: random() * Math.PI });
  }
  addInstanced(root, bushGeometry, bushMaterial, bushes, { colors: ['#5c8444', '#6b9350', '#4e7539'], name: 'arbustos' });

  const rocks = [];
  for (let attempt = 0; attempt < 600 && rocks.length < 26; attempt++) {
    const x = (random() * 2 - 1) * 63, z = 20 + random() * 120;
    if (blockedSpot(x, z, 6)) continue;
    if (roundedSdf(x, z, TRACK.outerX, TRACK.outerZ, TRACK.corner) < 2.5) continue;
    if (rocks.some(r => Math.hypot(r.x - x, r.z - z) < 5)) continue;
    rocks.push({ x, z, s: 0.4 + random() * 1.1, sy: 0.3 + random() * 0.6, rotation: random() * Math.PI });
  }
  addInstanced(root, new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: '#8b877b', flatShading: true, roughness: 1 }), rocks, { name: 'pedras' });

  // Pilhas de pneus marcam as áreas externas do traçado.
  const tireGeometry = new THREE.TorusGeometry(0.36, 0.13, 6, 12).rotateX(Math.PI / 2);
  const tireMaterial = new THREE.MeshStandardMaterial({ color: '#232626', roughness: 0.95 });
  const stacks = [[-48, 34], [-44, 34], [-48, 126], [-44, 126], [42, 36], [46, 36], [42, 124], [46, 124], [-24, 31], [24, 31]];
  const tires = [];
  for (const [x, z] of stacks) {
    for (let i = 0; i < 3; i++) tires.push({ x, y: 0.13 + i * 0.19, z, s: 1, rotation: i * 0.5 });
    collision.addBox(x, z, 1.1, 1.1, 'pilha de pneus');
  }
  addInstanced(root, tireGeometry, tireMaterial, tires, { name: 'pneus de pista' });

  // Postes e cones.
  const lampPoles = [], lampHeads = [];
  for (const [x, z] of [[-66, 30], [66, 30], [-66, 82], [66, 82], [-66, 134], [66, 134]]) {
    lampPoles.push({ x, y: 2.6, z, s: 1 });
    lampHeads.push({ x, y: 5.25, z, s: 1 });
    collision.addBox(x, z, 0.4, 0.4, 'poste do pátio');
  }
  addInstanced(root, new THREE.CylinderGeometry(0.08, 0.11, 5.2, 8), new THREE.MeshStandardMaterial({ color: '#595f5d', roughness: 0.6, metalness: 0.4 }), lampPoles, { name: 'postes de luz' });
  addInstanced(root, new THREE.BoxGeometry(0.62, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: '#e7e6d8', emissive: '#fff6d6', emissiveIntensity: 0.7, roughness: 0.5 }), lampHeads, { name: 'luminárias do pátio' });

  const cones = [];
  for (const x of [gate.x - 5.2, gate.x + 5.2]) {
    for (const z of [16.5, 19, 21.5, 24, 26.5, 29]) cones.push({ x, y: 0.24, z, s: 1 });
  }
  addInstanced(root, new THREE.ConeGeometry(0.18, 0.48, 8), new THREE.MeshStandardMaterial({ color: '#c8552e', roughness: 0.7 }), cones, { name: 'cones' });

  // Placa de entrada da pista.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), new THREE.MeshStandardMaterial({ map: signTexture('PISTA DE TESTES'), roughness: 0.7, side: THREE.DoubleSide }));
  sign.position.set(8, 2.5, 30.5);
  root.add(sign);
  const signPostMaterial = new THREE.MeshStandardMaterial({ color: '#5b6361', roughness: 0.6, metalness: 0.3 });
  for (const dx of [-2.2, 2.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), signPostMaterial);
    post.position.set(8 + dx, 1.3, 30.55); root.add(post);
  }
  collision.addBox(8, 30.55, 5.4, 0.4, 'placa da pista');

  // Horizonte: árvores distantes e colinas, mantidas mesmo de dentro da oficina.
  const distant = [];
  const distantMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, color: '#b9c7b4' });
  const distantTrees = [];
  for (let attempt = 0; attempt < 260 && distantTrees.length < 40; attempt++) {
    const angle = random() * Math.PI * 2, radius = 105 + random() * 75;
    const x = Math.cos(angle) * radius, z = 78 + Math.sin(angle) * radius;
    if (distantTrees.some(t => Math.hypot(t.x - x, t.z - z) < 12)) continue;
    distantTrees.push({ x, z, s: 2.2 + random() * 1.8, y: -0.04, rotation: random() * Math.PI });
  }
  addInstanced(backdrop, treeGeometry(), distantMaterial, distantTrees, { name: 'linha de árvores distante' });
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.3;
    distant.push({ x: Math.cos(angle) * 215, z: 78 + Math.sin(angle) * 215, sx: 70 + (i % 3) * 20, sy: 18 + (i % 4) * 7, sz: 70 + (i % 2) * 25, rotation: angle });
  }
  addInstanced(backdrop, new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: '#78906b', flatShading: true, roughness: 1 }), distant, { name: 'colinas distantes' });

  const hemi = new THREE.HemisphereLight('#e3f2ff', '#7e8c60', 1.15);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.set(58, 92, 18); sun.target.position.set(0, 0, 78); sun.castShadow = false;
  root.add(hemi, sun, sun.target);

  return {
    root,
    backdrop,
    lights: { hemi, sun },
    layout: {
      spawn: [spawn[0], spawn[1]],
      heading: config.driving?.heading ?? Math.PI,
      centerX: gate.x,
      startZ: TRACK.centerZ - 59,
    },
  };
}
