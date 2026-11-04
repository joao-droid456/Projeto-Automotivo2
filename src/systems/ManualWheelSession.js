import * as THREE from 'three';
import {
  WheelMaintenanceActivity,
  WHEEL_MANUAL_LIMITS,
  WHEEL_TOOLS,
} from '../education/WheelMaintenanceActivity.js';
import { ConstrainedPartDrag } from '../interactions/ConstrainedPartDrag.js';
import { disposeObject3D } from '../utils/DisposeUtils.js';

function remember(object) {
  return {
    object,
    parent: object.parent,
    index: object.parent.children.indexOf(object),
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
    visible: object.visible,
    color: object.material?.color?.clone(),
  };
}
function restore(snapshot) {
  const { object, parent, index } = snapshot;
  parent.add(object);
  parent.children.splice(parent.children.indexOf(object), 1);
  parent.children.splice(Math.min(index, parent.children.length), 0, object);
  object.position.copy(snapshot.position);
  object.quaternion.copy(snapshot.quaternion);
  object.scale.copy(snapshot.scale);
  object.visible = snapshot.visible;
  if (snapshot.color) object.material.color.copy(snapshot.color);
}

/** One real wheel, controlled transforms, and one input adapter; no additional render loop. */
export class ManualWheelSession {
  constructor(
    inspection,
    vehicle,
    { order, progress, activityId = 'montagem-roda', wheelId, onChange = () => {} } = {},
  ) {
    const station = vehicle?.wheelStations?.get(wheelId || 'front-wheel-left');
    const wheel = station?.wheel || (!wheelId ? vehicle?.activeWheel : null);
    const bolts = station?.bolts || vehicle?.bolts;
    const supports = station?.supports || vehicle?.wheelSupports;
    if (
      !wheel?.visible ||
      bolts?.length !== 4 ||
      !supports?.length ||
      !bolts.every(bolt => bolt.parent === wheel && bolt.visible)
    )
      throw new Error('Esta prática requer a roda montada, quatro fixadores e os apoios do carro didático.');
    Object.assign(this, { inspection, vehicle, progress, activityId, onChange });
    this.wheelId = wheelId || 'front-wheel-left';
    this.bolts = bolts;
    this.supports = supports;
    this.activity = new WheelMaintenanceActivity(order);
    this.active = true;
    this.busy = false;
    this.wheelAngle = 0;
    this.canvas = inspection.engine.renderer.domElement;
    this.orbit = inspection.orbit;
    this.wheel = wheel;
    this.supportObject = supports.find(object => object.position.y > 0.1);
    if (!this.supportObject) throw new Error('Apoio da roda indisponível.');
    this.snapshots = [remember(this.wheel), ...bolts.map(remember)];
    this.savedView = {
      position: inspection.camera.position.clone(),
      quaternion: inspection.camera.quaternion.clone(),
      target: this.orbit.target.clone(),
      minDistance: this.orbit.minDistance,
      maxDistance: this.orbit.maxDistance,
      minPolarAngle: this.orbit.minPolarAngle,
      maxPolarAngle: this.orbit.maxPolarAngle,
      minAzimuthAngle: this.orbit.minAzimuthAngle,
      maxAzimuthAngle: this.orbit.maxAzimuthAngle,
      enableDamping: this.orbit.enableDamping,
      enabled: this.orbit.enabled,
    };
    vehicle.group.updateWorldMatrix(true, true);
    this.seat = this.wheel.getWorldPosition(new THREE.Vector3());
    this.seatQuaternion = this.wheel.getWorldQuaternion(new THREE.Quaternion());
    this.axis = new THREE.Vector3(0, 0, 1).transformDirection(this.wheel.matrixWorld);
    this.right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.seatQuaternion);
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.drag = new ConstrainedPartDrag();
    this.tmp = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.localAxis = new THREE.Vector3(0, 0, 1);
    this.stage = new THREE.Group();
    this.stage.name = 'roda-manual-apoios-e-ferramentas';
    inspection.scene.add(this.stage);
    this.buildRig();
    this.pickObjects = [];
    this.abort = new AbortController();
    const options = { capture: true, signal: this.abort.signal };
    this.canvas.addEventListener('pointerdown', event => this.pointerDown(event), options);
    this.canvas.addEventListener('pointermove', event => this.pointerMove(event), options);
    this.canvas.addEventListener('pointerup', event => this.pointerUp(event), options);
    this.canvas.addEventListener('pointercancel', () => this.cancelInput(), options);
    this.canvas.addEventListener('lostpointercapture', () => this.cancelInput(), options);
    const ownerDocument = this.canvas.ownerDocument;
    ownerDocument?.defaultView?.addEventListener('blur', () => this.cancelInput(), {
      signal: this.abort.signal,
    });
    ownerDocument?.addEventListener(
      'visibilitychange',
      () => {
        if (ownerDocument.hidden) this.cancelInput();
      },
      { signal: this.abort.signal },
    );
    this.focus();
    this.syncTargets();
  }

  buildRig() {
    const hitGeometry = new THREE.SphereGeometry(0.055, 10, 8);
    const ringGeometry = new THREE.TorusGeometry(0.045, 0.004, 5, 24);
    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const marker = (kind, index) => {
      const group = new THREE.Group();
      const hit = new THREE.Mesh(hitGeometry, hitMaterial);
      hit.visible = false;
      hit.userData.manualTarget = { kind, index };
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ color: '#e8c66d', depthTest: false, transparent: true, opacity: 0.9 }),
      );
      group.add(hit, ring);
      this.stage.add(group);
      return { group, hit, ring };
    };
    this.boltMarkers = this.bolts.map((_, index) => marker('bolt', index));
    this.supportMarker = marker('support');
    this.supportMarker.group.scale.setScalar(1.5);
    this.supportPoint = this.supportObject.getWorldPosition(new THREE.Vector3());
    this.supportMarker.group.position
      .copy(this.supportPoint)
      .addScaledVector(this.right, 0.43)
      .addScaledVector(this.axis, 0.3);
    this.supportMarker.group.position.y -= 0.08;
    this.supportMarker.group.quaternion.copy(this.seatQuaternion);
    const line = new THREE.BufferGeometry().setFromPoints([
      this.supportPoint,
      this.supportMarker.group.position,
    ]);
    this.supportLine = new THREE.Line(
      line,
      new THREE.LineBasicMaterial({ color: '#e8c66d', depthTest: false }),
    );
    this.stage.add(this.supportLine);
    this.hubMarker = marker('hub');
    this.hubMarker.group.scale.setScalar(1.4);
    this.hubMarker.group.position.copy(this.seat).addScaledVector(this.axis, 0.23);
    this.hubMarker.group.quaternion.copy(this.seatQuaternion);
    this.snapRing = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: '#8bceda', transparent: true, opacity: 0.65, depthTest: false }),
    );
    this.snapRing.scale.setScalar(8.6);
    this.snapRing.position.copy(this.seat).addScaledVector(this.axis, 0.12);
    this.snapRing.quaternion.copy(this.seatQuaternion);
    this.stage.add(this.snapRing);
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.045, 0.55),
      new THREE.MeshStandardMaterial({ color: '#495d68', metalness: 0.3, roughness: 0.7 }),
    );
    tray.position.copy(this.seat).addScaledVector(this.right, 0.85).addScaledVector(this.axis, 0.8);
    tray.position.y -= 0.43;
    tray.quaternion.copy(this.seatQuaternion);
    this.stage.add(tray);
    this.traySlots = this.bolts.map((_, i) =>
      this.seat
        .clone()
        .addScaledVector(this.right, 0.28 + i * 0.17)
        .addScaledVector(this.axis, 0.64)
        .add(new THREE.Vector3(0, -0.375, 0)),
    );
    this.toolMesh = new THREE.Group();
    this.stage.add(this.toolMesh);
    const toolMaterial = new THREE.MeshStandardMaterial({
      color: '#e1b45b',
      metalness: 0.7,
      roughness: 0.35,
    });
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.055, 12), toolMaterial);
    socket.rotation.x = Math.PI / 2;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.024), toolMaterial);
    handle.position.y = -0.11;
    this.toolMesh.add(socket, handle);
    this.toolMesh.visible = false;
    this.hitObjects = [
      this.supportMarker.hit,
      this.hubMarker.hit,
      ...this.boltMarkers.map(marker => marker.hit),
      this.wheel,
    ];
  }

  get view() {
    return {
      phase: this.activity.phase,
      instruction: this.activity.instruction,
      tool: this.activity.tool,
      tools: WHEEL_TOOLS,
      busy: this.busy,
      completed: this.activity.completed,
      feedback: this.feedback || '',
    };
  }
  notify(message = '') {
    this.feedback = message;
    this.syncTargets();
    this.onChange();
  }
  selectTool(id) {
    if (this.busy) return;
    this.cancelInput();
    const result = this.activity.selectTool(id);
    this.notify(result.ok ? '' : result.message);
  }
  focus() {
    this.cancelInput();
    this.orbit.enableDamping = false;
    this.orbit.minDistance = 0.7;
    this.orbit.maxDistance = 4.5;
    this.orbit.minPolarAngle = 0.45;
    this.orbit.maxPolarAngle = 1.7;
    const azimuth = Math.atan2(this.axis.x, this.axis.z);
    this.orbit.minAzimuthAngle = azimuth - 0.65;
    this.orbit.maxAzimuthAngle = azimuth + 0.65;
    this.orbit.target.copy(this.seat).addScaledVector(this.right, 0.3).addScaledVector(this.axis, 0.3);
    this.inspection.camera.position
      .copy(this.orbit.target)
      .addScaledVector(this.right, 0.12)
      .addScaledVector(this.axis, 2.35);
    this.inspection.camera.position.y += 0.62;
    this.orbit.update();
  }
  rayFromClient(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1);
    this.inspection.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.inspection.camera);
    return true;
  }
  pickRay(ray) {
    this.syncTargets();
    this.stage.updateMatrixWorld(true);
    this.vehicle.group.updateWorldMatrix(true, true);
    this.raycaster.ray.copy(ray);
    this.pickObjects.length = 0;
    for (const object of this.hitObjects) {
      const kind = object.userData.manualTarget?.kind;
      if (kind === 'support' && this.activity.phase !== 'prepare') continue;
      if (kind === 'hub' && this.activity.phase !== 'verify') continue;
      this.pickObjects.push(object);
    }
    for (const hit of this.raycaster.intersectObjects(this.pickObjects, true)) {
      if (hit.object.userData.manualTarget) return hit.object.userData.manualTarget;
      for (let object = hit.object; object; object = object.parent) {
        const index = this.bolts.indexOf(object);
        if (index >= 0) return { kind: 'bolt', index };
        if (object === this.wheel) return { kind: 'wheel' };
      }
    }
    return null;
  }
  claim(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  capture(event, gesture) {
    this.gesture = {
      ...gesture,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
    };
    this.orbitBeforeGesture = this.orbit.enabled;
    this.orbit.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
  }

  pointerDown(event) {
    if (!this.active || event.button !== 0 || event.isPrimary === false || this.gesture) return;
    if (!this.rayFromClient(event.clientX, event.clientY)) return;
    const target = this.pickRay(this.raycaster.ray);
    if (!target) return;
    this.claim(event);
    if (this.busy || this.activity.completed) return;
    const a = this.activity;
    if (target.kind === 'support' && a.phase === 'prepare') {
      this.notify(a.confirmSupport(this.supports.length > 0).message);
      return;
    }
    if (target.kind === 'hub' && a.phase === 'verify') {
      const result = a.verify();
      if (result.ok && !this.saved) {
        this.saved = true;
        this.progress?.complete(this.activityId, Math.max(0, 100 - a.mistakes * 5), 100);
      }
      this.notify(result.message);
      return;
    }
    if (target.kind === 'bolt') {
      if (a.phase === 'loosen' || a.phase === 'tighten') {
        const result = a.turnBolt(target.index, 0);
        if (!result.ok) {
          this.notify(result.message);
          return;
        }
        this.capture(event, { kind: 'turn', index: target.index, phase: a.phase });
        this.bolts[target.index].getWorldPosition(this.toolMesh.position);
        this.toolMesh.position.addScaledVector(this.axis, 0.055);
        this.toolMesh.quaternion.copy(this.seatQuaternion);
        this.toolMesh.children[0].material.color.set(a.tool === 'torque' ? '#8bc7df' : '#e1b45b');
        this.toolMesh.visible = true;
        return;
      }
      if (['removeBolts', 'installBolts'].includes(a.phase) && a.tool === 'hand') {
        if (
          (a.phase === 'removeBolts' && a.removed.has(target.index)) ||
          (a.phase === 'installBolts' && a.installed.has(target.index))
        ) {
          this.notify('Este fixador já foi posicionado. Escolha o próximo.');
          return;
        }
        this.capture(event, { kind: 'bolt-click', index: target.index, phase: a.phase });
        return;
      }
    }
    if (target.kind === 'wheel' && ['removeWheel', 'returnWheel'].includes(a.phase) && a.tool === 'hand') {
      this.stage.attach(this.wheel);
      const startPosition = this.wheel.position.clone(),
        startQuaternion = this.wheel.quaternion.clone();
      this.inspection.camera.getWorldDirection(this.normal);
      if (!this.drag.begin(this.raycaster.ray, startPosition, this.normal)) return;
      this.capture(event, {
        kind: event.shiftKey && a.phase === 'returnWheel' ? 'rotate' : 'drag',
        phase: a.phase,
        startPosition,
        startQuaternion,
        startAngle: this.wheelAngle,
      });
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    this.notify(
      a.fail(
        a.phase === 'prepare'
          ? 'Confira primeiro o marcador do apoio com Inspeção.'
          : a.phase === 'loosen' || a.phase === 'removeBolts'
            ? 'A roda permanece presa. Conclua os fixadores com a ferramenta indicada.'
            : 'Use a ferramenta indicada e interaja na peça desta etapa.',
      ).message,
    );
  }

  pointerMove(event) {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    this.claim(event);
    const dx = event.clientX - g.lastX;
    g.lastX = event.clientX;
    if (g.kind === 'turn') {
      if (g.finished) return;
      const result = this.activity.turnBolt(
        g.index,
        (dx / WHEEL_MANUAL_LIMITS.pixelsPerTurn) * (g.phase === 'loosen' ? -1 : 1),
      );
      if (!result.ok) {
        this.notify(result.message);
        return;
      }
      const progress = this.activity.turns[g.index];
      const angle = progress * Math.PI * 2 * (g.phase === 'loosen' ? 1 : -1);
      this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
      this.bolts[g.index].quaternion.copy(this.snapshots[g.index + 1].quaternion).multiply(this.rotation);
      this.bolts[g.index].getWorldPosition(this.toolMesh.position);
      this.toolMesh.position.addScaledVector(this.axis, 0.055);
      this.toolMesh.quaternion.setFromAxisAngle(this.axis, angle).multiply(this.seatQuaternion);
      this.inspection.panel.manualProgress?.(g.index, progress);
      if (progress === 1) {
        g.finished = true;
        this.notify();
      }
      return;
    }
    if (g.kind === 'bolt-click') {
      if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 6) g.moved = true;
      return;
    }
    if (g.kind === 'rotate') {
      this.wheelAngle += dx * 0.014;
      this.rotation.setFromAxisAngle(this.localAxis, this.wheelAngle);
      this.wheel.quaternion.copy(this.seatQuaternion).multiply(this.rotation);
    } else if (
      this.rayFromClient(event.clientX, event.clientY) &&
      this.drag.move(this.raycaster.ray, this.tmp)
    ) {
      this.delta.copy(this.tmp).sub(this.seat);
      this.delta.addScaledVector(this.axis, -this.delta.dot(this.axis));
      const horizontal = THREE.MathUtils.clamp(this.delta.dot(this.right), -0.8, 1.45);
      const vertical = THREE.MathUtils.clamp(this.delta.y, 0, 0.7);
      this.delta.copy(this.right).multiplyScalar(horizontal);
      this.delta.y = vertical;
      const lateral = this.delta.length();
      const outward =
        g.phase === 'removeWheel'
          ? WHEEL_MANUAL_LIMITS.clearance * Math.min(1, lateral / WHEEL_MANUAL_LIMITS.removalTravel)
          : WHEEL_MANUAL_LIMITS.clearance * Math.min(1, (lateral / 0.6) ** 2);
      this.wheel.position.copy(this.seat).add(this.delta).addScaledVector(this.axis, outward);
    }
    this.snapRing.material.color.set(
      this.activity.canSnap(this.wheel.position.distanceTo(this.seat), this.wheelAngle)
        ? '#8ce5ae'
        : '#8bceda',
    );
  }

  pointerUp(event) {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    this.claim(event);
    this.releaseInput();
    if (g.kind === 'turn' && g.finished) {
      const bolt = this.bolts[g.index];
      const target = this.snapshots[g.index + 1].position.clone();
      if (g.phase === 'loosen') target.z += 0.035;
      this.animate(bolt, target, this.snapshots[g.index + 1].quaternion, () => this.notify(), 0.18);
    } else if (g.kind === 'bolt-click' && !g.moved) this.transferBolt(g.index, g.phase);
    else if (g.kind === 'drag' && g.phase === 'removeWheel') {
      this.delta.copy(this.wheel.position).sub(this.seat);
      const clearance = this.delta.dot(this.axis);
      this.delta.addScaledVector(this.axis, -clearance);
      const result = this.activity.detachWheel(this.delta.length(), clearance + 1e-8);
      if (!result.ok)
        this.animate(this.wheel, this.seat, this.seatQuaternion, () => {
          this.vehicle.group.attach(this.wheel);
          this.notify(result.message);
        });
      else this.notify();
    } else if (g.kind === 'drag' || g.kind === 'rotate') this.trySnap();
  }

  transferBolt(index, phase) {
    const bolt = this.bolts[index];
    this.stage.attach(bolt);
    if (phase === 'removeBolts') {
      this.animate(bolt, this.traySlots[index], new THREE.Quaternion(), () =>
        this.notify(this.activity.removeBolt(index).message),
      );
    } else {
      this.wheel.updateWorldMatrix(true, false);
      const target = this.wheel.localToWorld(this.snapshots[index + 1].position.clone());
      const quaternion = this.wheel
        .getWorldQuaternion(new THREE.Quaternion())
        .multiply(this.snapshots[index + 1].quaternion);
      this.animate(bolt, target, quaternion, () => {
        this.wheel.attach(bolt);
        bolt.position.copy(this.snapshots[index + 1].position);
        bolt.quaternion.copy(this.snapshots[index + 1].quaternion);
        this.notify(this.activity.installBolt(index).message);
      });
    }
  }
  trySnap() {
    const distance = this.wheel.position.distanceTo(this.seat);
    if (!this.activity.canSnap(distance, this.wheelAngle)) {
      this.notify('Aproxime do anel do cubo; use Shift + arrastar se precisar alinhar os alojamentos.');
      return;
    }
    const angle = Math.round(this.wheelAngle / (Math.PI / 2)) * (Math.PI / 2);
    const targetQuaternion = this.seatQuaternion
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle));
    this.animate(this.wheel, this.seat, targetQuaternion, () => {
      this.vehicle.group.attach(this.wheel);
      this.wheel.position.copy(this.snapshots[0].position);
      this.wheelAngle = angle;
      this.notify(this.activity.seatWheel(distance, angle).message);
    });
  }
  animate(object, position, quaternion, done, duration = 0.35) {
    this.busy = true;
    this.animation = {
      object,
      from: object.position.clone(),
      to: position.clone(),
      fromQuaternion: object.quaternion.clone(),
      toQuaternion: quaternion.clone(),
      elapsed: 0,
      duration,
      done,
    };
    this.notify();
  }
  update(dt) {
    if (!this.active || !this.animation || !Number.isFinite(dt) || dt <= 0) return;
    const a = this.animation;
    a.elapsed = Math.min(a.duration, a.elapsed + dt);
    const t = a.elapsed / a.duration,
      eased = t * t * (3 - 2 * t);
    a.object.position.lerpVectors(a.from, a.to, eased);
    a.object.quaternion.slerpQuaternions(a.fromQuaternion, a.toQuaternion, eased);
    this.syncTargets();
    if (t === 1) {
      this.animation = null;
      this.busy = false;
      a.done();
    }
  }
  syncTargets() {
    if (!this.boltMarkers) return;
    const a = this.activity;
    this.supportMarker.ring.visible = this.supportLine.visible = a.phase === 'prepare';
    this.hubMarker.ring.visible = a.phase === 'verify';
    this.snapRing.visible = ['removeWheel', 'returnWheel'].includes(a.phase);
    this.bolts.forEach((bolt, i) => {
      const marker = this.boltMarkers[i];
      bolt.getWorldPosition(marker.group.position);
      marker.group.quaternion.copy(this.seatQuaternion);
      if (bolt.parent === this.stage) marker.group.rotation.x = -Math.PI / 2;
      else marker.group.position.addScaledVector(this.axis, 0.035);
      marker.ring.visible = ['loosen', 'removeBolts', 'installBolts', 'tighten'].includes(a.phase);
      marker.ring.material.color.set(
        a.phase === 'tighten' && i === a.nextBolt
          ? '#8bffce'
          : a.tightened.includes(i)
            ? '#7ab59a'
            : '#e8c66d',
      );
    });
  }
  releaseInput() {
    const g = this.gesture;
    this.gesture = null;
    this.drag.end();
    this.toolMesh.visible = false;
    if (g) {
      this.orbit.enabled = this.orbitBeforeGesture;
      if (this.canvas.hasPointerCapture(g.pointerId)) this.canvas.releasePointerCapture(g.pointerId);
    }
    this.canvas.style.cursor = '';
  }
  cancelInput() {
    const g = this.gesture;
    if (g?.startPosition) {
      this.wheel.position.copy(g.startPosition);
      this.wheel.quaternion.copy(g.startQuaternion);
      this.wheelAngle = g.startAngle;
    }
    this.releaseInput();
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.cancelInput();
    this.abort.abort();
    this.animation = null;
    this.snapshots.forEach(restore);
    this.stage.removeFromParent();
    disposeObject3D(this.stage);
    this.stage.clear();
    for (const key of [
      'minDistance',
      'maxDistance',
      'minPolarAngle',
      'maxPolarAngle',
      'minAzimuthAngle',
      'maxAzimuthAngle',
      'enableDamping',
      'enabled',
    ])
      this.orbit[key] = this.savedView[key];
    this.orbit.target.copy(this.savedView.target);
    this.inspection.camera.position.copy(this.savedView.position);
    this.inspection.camera.quaternion.copy(this.savedView.quaternion);
    this.orbit.update();
    this.inspection.panel.clearManualWheel?.();
    this.inspection.panel.hover?.(null);
  }
}
