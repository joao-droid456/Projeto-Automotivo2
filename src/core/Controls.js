import { Vector3 } from 'three';

export class Controls {
  constructor(camera, canvas, collision, config, onPause) {
    Object.assign(this, { camera, canvas, collision, config, onPause });
    this.keys = new Set();
    this.active = false;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.stick = { x: 0, y: 0 };
    this.yaw = config.spawnYaw;
    this.pitch = 0;
    this.velocity = new Vector3();
    this.direction = new Vector3();
    this.upAxis = new Vector3(0, 1, 0);
    this.sensitivity = 1;
    this.camera.rotation.order = 'YXZ';
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    document.addEventListener('keydown', e => {
      if (!this.active || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) {
        this.keys.add(e.code); e.preventDefault();
      }
    }, options);
    document.addEventListener('keyup', e => this.keys.delete(e.code), options);
    document.addEventListener('mousemove', e => {
      if (this.active && document.pointerLockElement === canvas) this.look(e.movementX, e.movementY);
    }, options);
    document.addEventListener('pointerlockchange', () => {
      this.clear();
      if (!document.pointerLockElement && this.active && !this.touch) this.onPause();
    }, options);
    document.addEventListener('pointerlockerror', () => {
      if (this.active) this.onPause('O navegador não liberou o mouse. Tente retomar; em telas de toque, use os controles virtuais.');
    }, options);
    window.addEventListener('blur', () => { if (this.active) this.onPause(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.onPause(); }, options);
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022 * this.sensitivity;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * 0.0022 * this.sensitivity));
    this.applyRotation();
  }
  applyRotation() { this.camera.rotation.set(this.pitch, this.yaw, 0); }
  clear() { this.keys.clear(); this.stick.x = this.stick.y = 0; this.velocity.set(0, 0, 0); }
  start() {
    this.active = true;
    this.clear();
    if (!this.touch) {
      try { this.canvas.requestPointerLock()?.catch(() => { if (this.active) this.onPause('Clique em retomar para liberar o controle do mouse.'); }); }
      catch { this.onPause('O controle do mouse não está disponível neste navegador.'); }
    }
  }
  stop() {
    this.active = false;
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  reset() {
    this.camera.position.fromArray(this.config.spawn);
    this.yaw = this.config.spawnYaw; this.pitch = 0;
    this.clear(); this.applyRotation();
  }
  update(dt) {
    if (!this.active || this.driving) return;
    const k = this.keys;
    const x = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')) + this.stick.x;
    const z = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')) + this.stick.y;
    this.direction.set(x, 0, z);
    if (this.direction.lengthSq() > 1) this.direction.normalize();
    this.direction.applyAxisAngle(this.upAxis, this.yaw);
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? this.config.runSpeed : this.config.walkSpeed;
    this.direction.multiplyScalar(speed);
    this.velocity.lerp(this.direction, 1 - Math.exp(-14 * dt));
    this.collision.move(this.camera.position, this.velocity.x * dt, this.velocity.z * dt);
    this.camera.position.y = this.config.eyeHeight;
  }
  dispose() { this.stop(); this.abort.abort(); }
}
