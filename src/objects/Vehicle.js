import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createUndercarriage } from './Undercarriage.js';
import { createVehicleExterior } from './VehicleExterior.js';
import { createVehicleInterior } from './VehicleInterior.js';

const metal = new THREE.MeshStandardMaterial({ color: '#a9afb0', roughness: 0.32, metalness: 0.8 });
const rubber = new THREE.MeshStandardMaterial({ color: '#252628', roughness: 0.93 });
const black = new THREE.MeshStandardMaterial({ color: '#202a2c', roughness: 0.6 });
const paint = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.44, metalness: 0.18, clearcoat: 0.25, clearcoatRoughness: 0.35 });
const mesh = (geometry, material, position, parent) => {
  const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};
export function cylinder(radius, depth, material, position, parent, segments = 40) {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material, position, parent); m.rotation.x = Math.PI / 2; return m;
}

export function createWheel(simple = false) {
  const group = new THREE.Group();
  const tag = (object, id) => { object.userData.inspectionPart = id; return object; };
  if (simple) {
    const tire = tag(mesh(new THREE.TorusGeometry(0.3, 0.095, 6, 24), rubber, [0, 0, 0], group), 'tire');
    tire.scale.z = 1.3;
    tag(cylinder(0.215, 0.16, black, [0, 0, 0], group, 16), 'wheel-rim');
    tag(mesh(new THREE.TorusGeometry(0.205, 0.016, 4, 20), metal, [0, 0, 0.1], group), 'wheel-rim');
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      const spoke = mesh(new THREE.BoxGeometry(0.045, 0.145, 0.025), metal,
        [Math.sin(angle) * 0.12, Math.cos(angle) * 0.12, 0.1], group);
      spoke.rotation.z = -angle;
      tag(spoke, 'wheel-spoke');
    }
    tag(cylinder(0.062, 0.04, metal, [0, 0, 0.12], group, 10), 'wheel-center-cap');
    return group;
  }
  const tire = tag(mesh(new THREE.TorusGeometry(0.302, 0.093, 14, 56), rubber, [0, 0, 0], group), 'tire');
  tire.scale.z = 1.35;
  tag(cylinder(0.225, 0.15, black, [0, 0, 0.015], group), 'wheel-rim');
  tag(cylinder(0.19, 0.16, metal, [0, 0, 0.03], group), 'wheel-rim');
  const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12), black, 8);
  const holeTransform = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    holeTransform.position.set(Math.sin(angle) * 0.145, Math.cos(angle) * 0.145, 0.12);
    holeTransform.rotation.x = Math.PI / 2; holeTransform.updateMatrix(); holes.setMatrixAt(i, holeTransform.matrix);
  }
  group.add(holes);
  tag(holes, 'wheel-opening');
  tag(mesh(new THREE.TorusGeometry(0.218, 0.008, 6, 40), metal, [0, 0, 0.095], group), 'wheel-rim');
  tag(cylinder(0.075, 0.03, black, [0, 0, 0.14], group), 'wheel-center-cap');
  // Blocos repetidos da banda são instanciados, sem uma chamada de desenho por bloco.
  const tread = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.009, 0.18), rubber, 52);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 52; i++) { const a = i / 52 * Math.PI * 2; dummy.position.set(Math.sin(a) * 0.392, Math.cos(a) * 0.392, 0); dummy.rotation.z = -a; dummy.updateMatrix(); tread.setMatrixAt(i, dummy.matrix); }
  tread.castShadow = true; group.add(tread);
  tag(tread, 'tire-tread');
  return group;
}

export class Vehicle {
  constructor(position = [5.2, 0, -3], options = {}) {
    const displayOnly = options.displayOnly === true;
    const round = (size, material, pos, parent, radius = 0.05) => mesh(
      new RoundedBoxGeometry(...size, 1, radius), material, pos, parent);
    const bodyPaint = color => displayOnly
      ? new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.18 }) : paint(color);
    this.group = new THREE.Group(); this.group.position.set(...position);
    this.group.name = 'veiculo-didatico-estimado';
    this.group.userData.dynamic = !options.color;
    const orange = bodyPaint(options.color || '#347d94'), cream = orange, red = orange, turquoise = black;
    const glass = displayOnly
      ? new THREE.MeshStandardMaterial({ color: '#425b60', metalness: 0.2, roughness: 0.3, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: '#425b60', metalness: 0.2, roughness: 0.18, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    glass.userData.inspectionPart = 'glass';
    round([3.85, 0.36, 1.56], black, [0, 0.51, 0], this.group);
    this.undercarriage = createUndercarriage({ metal, black, rubber, serviceable: options.serviceable });
    this.group.add(this.undercarriage);
    this.group.add(createVehicleExterior({ body: orange, trim: black, metal, glass }));
    this.interior = createVehicleInterior();
    this.group.add(this.interior);
    // Flancs extrudés avec véritables passages de roue, pas de cube posé sur quatre roues.
    const profile = new THREE.Shape();
    profile.moveTo(-1.95, 0.48); profile.lineTo(-1.97, 0.88);
    profile.quadraticCurveTo(-1.85, 1.04, -1.5, 1.05); profile.lineTo(1.56, 1.1);
    profile.quadraticCurveTo(1.92, 1.1, 1.95, 0.9); profile.lineTo(1.95, 0.48); profile.lineTo(1.72, 0.48);
    profile.bezierCurveTo(1.72, 1.03, 0.7, 1.03, 0.7, 0.48); profile.lineTo(-0.73, 0.48);
    profile.bezierCurveTo(-0.73, 1.03, -1.75, 1.03, -1.75, 0.48); profile.closePath();
    const bodyGeometry = new THREE.ExtrudeGeometry(profile, { depth: 0.065, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: displayOnly ? 1 : 2, curveSegments: displayOnly ? 6 : 16 });
    for (const side of [-1, 1]) {
      mesh(bodyGeometry, orange, [0, 0, side > 0 ? 0.76 : -0.825], this.group);
      round([1.4, 0.36, 0.035], cream, [-0.15, 0.87, side * 0.81], this.group, 0.08);
      round([1.35, 0.025, 0.035], black, [-0.15, 0.66, side * 0.84], this.group, 0.01);
      round([0.23, 0.045, 0.045], black, [0.36, 1.05, side * 0.845], this.group, 0.018);
      round([0.18, 0.12, 0.16], black, [-0.78, 1.22, side * 0.9], this.group, 0.04);
    }
    round([0.38, 0.4, 1.52], red, [1.79, 0.88, 0], this.group, 0.16);
    round([0.85, 0.12, 1.64], orange, [1.48, 1.08, 0], this.group, 0.035);
    const tailPaint = bodyPaint('#a92320');
    for (const side of [-1, 1]) round([0.08, 0.22, 0.25], tailPaint, [2.01, 1.02, side * 0.59], this.group, 0.04).userData.inspectionPart = 'lights';
    round([0.22, 0.23, 1.65], turquoise, [1.98, 0.59, 0], this.group, 0.08);
    round([0.21, 0.23, 1.65], black, [-1.99, 0.59, 0], this.group, 0.06);
    this.headlightMaterial = new THREE.MeshStandardMaterial({ color: '#e5f3ff', emissive: '#c8e9ff', emissiveIntensity: 0.05, roughness: 0.15 });
    this.indicatorMaterial = new THREE.MeshStandardMaterial({ color: '#e89b29', emissive: '#ff9800', emissiveIntensity: 0 });
    for (const side of [-1, 1]) {
      round([0.15, 0.18, 0.43], this.headlightMaterial, [-1.95, 0.9, side * 0.52], this.group, 0.07).userData.inspectionPart = 'lights';
      round([0.12, 0.09, 0.14], this.indicatorMaterial, [-1.97, 0.73, side * 0.65], this.group, 0.035).userData.inspectionPart = 'lights';
      round([0.09, 0.09, 0.14], this.indicatorMaterial, [2.03, 0.86, side * 0.63], this.group, 0.03).userData.inspectionPart = 'lights';
    }
    round([0.12, 0.15, 0.55], black, [-2.02, 0.79, 0], this.group);
    this.hood = new THREE.Group(); this.hood.position.set(-0.94, 1.08, 0); this.group.add(this.hood);
    this.hood.userData.inspectionPart = 'hood';
    round([1.09, 0.12, 1.64], orange, [-0.51, -0.01, 0], this.hood, 0.035);
    if (displayOnly) {
      for (const x of [-1.24, 1.21]) for (const side of [-1, 1]) {
        const wheel = createWheel(true);
        wheel.userData.inspectionPart = `${x < 0 ? 'front' : 'rear'}-wheel-${side > 0 ? 'left' : 'right'}`;
        wheel.position.set(x, 0.4, side * 0.84);
        if (side < 0) wheel.rotation.y = Math.PI;
        this.group.add(wheel);
      }
      this.group.traverse(o => {
        if (!o.isMesh) return;
        o.userData.static = true;
        // Windows do not cast solid shadows onto the body below them.
        if (o.material === glass) o.castShadow = false;
      });
      if (options.serviceable) this.hood.traverse(o => { o.userData.static = false; });
      this.interior.traverse(o => { o.userData.static = false; });
      return;
    }
    this.engine = new THREE.Group(); this.engine.position.set(-1.4, 0.8, 0); this.group.add(this.engine);
    round([0.6, 0.35, 0.65], metal, [0, 0, 0], this.engine);
    round([0.63, 0.08, 0.38], black, [0, 0.21, 0], this.engine);
    for (let i = 0; i < 4; i++) cylinder(0.045, 0.12, metal, [-0.23 + i * 0.15, 0.27, 0], this.engine);
    this.airbox = new THREE.Group(); this.airbox.position.set(-1.42, 1.01, 0.43); this.group.add(this.airbox);
    round([0.48, 0.08, 0.35], black, [0, 0, 0], this.airbox, 0.035);
    this.filter = round([0.39, 0.045, 0.27], paint('#c9b48a'), [0, 0.06, 0], this.airbox, 0.015);
    for (let i = 0; i < 10; i++) round([0.018, 0.014, 0.24], metal, [-0.17 + i * 0.038, 0.029, 0], this.filter, 0.005);
    this.filterCover = round([0.48, 0.055, 0.35], black, [0, 0.105, 0], this.airbox, 0.025);
    this.battery = new THREE.Group(); this.battery.position.set(-1.45, 0.98, -0.46); this.group.add(this.battery);
    this.engine.userData.inspectionPart = 'engine';
    this.airbox.userData.inspectionPart = 'filter';
    this.battery.userData.inspectionPart = 'battery';
    round([0.42, 0.23, 0.28], black, [0, 0, 0], this.battery, 0.025);
    this.terminals = [];
    for (const side of [-1, 1]) {
      const terminal = round([0.075, 0.055, 0.075], paint(side > 0 ? '#df493e' : '#849397'), [side * 0.13, 0.14, 0], this.battery, 0.015);
      this.terminals.push(terminal);
    }
    this.lightsOn = false; this.hazardsOn = false; this.lightTime = 0;
    this.filterCoverLift = 0; this.filterLift = 0;
    this.wheels = [];
    for (const x of [-1.24, 1.21]) for (const side of [-1, 1]) {
      const wheel = createWheel(); wheel.position.set(x, 0.4, side * 0.84); if (side < 0) wheel.rotation.y = Math.PI;
      wheel.userData.inspectionPart = `${x < 0 ? 'front' : 'rear'}-wheel-${side > 0 ? 'left' : 'right'}`;
      this.group.add(wheel); this.wheels.push(wheel);
    }
    this.activeWheel = this.wheels[1]; // Referência da atividade de montagem original.
    this.hubLocal = new THREE.Vector3(-1.24, 0.4, 0.84);
    this.wheelStations = new Map();
    for (const wheel of this.wheels) {
      const hub = new THREE.Group(); hub.position.copy(wheel.position); hub.quaternion.copy(wheel.quaternion); this.group.add(hub);
      hub.userData.inspectionPart = wheel.userData.inspectionPart;
      cylinder(0.17, 0.065, metal, [0, 0, -0.025], hub).userData.inspectionPart = 'wheel-hub';
      cylinder(0.055, 0.11, metal, [0, 0, 0.03], hub).userData.inspectionPart = 'wheel-hub';
      round([0.09, 0.18, 0.09], paint('#7b7d70'), [0.155, 0.03, -0.02], hub, 0.025);
      this.wheelStations.set(wheel.userData.inspectionPart, { wheel, hub, supports: [] });
    }
    this.hubGroup = this.wheelStations.get('front-wheel-left').hub;
    // Suporte fixo didático sob o eixo. Não é um elevador operável.
    this.wheelSupports = [];
    for (const x of [-1.24, 1.21]) for (const side of options.color ? [] : [-1, 1]) {
      const base = round([0.36, 0.045, 0.45], black, [x, 0.025, side * 0.5], this.group);
      const support = round([0.13, 0.31, 0.13], metal, [x, 0.2, side * 0.5], this.group);
      for (const object of [base, support]) { object.userData.inspectionPart = 'wheel-support'; this.wheelSupports.push(object); }
      this.wheelStations.get(`${x < 0 ? 'front' : 'rear'}-wheel-${side > 0 ? 'left' : 'right'}`).supports.push(base, support);
    }
    this.boltPositions = Array.from({ length: 4 }, (_, i) => {
      const a = i * Math.PI / 2; return new THREE.Vector3(Math.sin(a) * 0.105, Math.cos(a) * 0.105, 0.17);
    });
    for (const station of this.wheelStations.values()) {
      station.bolts = this.boltPositions.map(p => cylinder(0.023, 0.045, metal.clone(), [p.x, p.y, p.z], station.wheel, 6));
      station.bolts.forEach(bolt => { bolt.userData.inspectionPart = 'wheel-fastener'; });
    }
    this.bolts = this.wheelStations.get('front-wheel-left').bolts;
    this.homeWheelPosition = this.activeWheel.position.clone();
    this.hoodOpen = false;
    if (options.color) this.group.traverse(o => { if (o.isMesh) o.userData.static = true; });
    this.interior.traverse(o => { o.userData.static = false; });
  }
  setHood(open) { this.hoodOpen = open; }
  update(dt) {
    this.hood.rotation.z = THREE.MathUtils.damp(this.hood.rotation.z, this.hoodOpen ? -1.05 : 0, 8, dt);
    this.filterCover.position.y = THREE.MathUtils.damp(this.filterCover.position.y, 0.105 + this.filterCoverLift, 7, dt);
    this.filter.position.y = THREE.MathUtils.damp(this.filter.position.y, 0.06 + this.filterLift, 7, dt);
    this.lightTime += dt;
    this.headlightMaterial.emissiveIntensity = this.lightsOn ? 2.5 : 0.05;
    this.indicatorMaterial.emissiveIntensity = this.hazardsOn && Math.sin(this.lightTime * 8) > 0 ? 3 : 0;
  }
  get hubWorld() { this.group.updateMatrixWorld(true); return this.group.localToWorld(this.hubLocal.clone()); }
}
