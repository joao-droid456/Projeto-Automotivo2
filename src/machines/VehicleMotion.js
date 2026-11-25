const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

const MAX_FORWARD = 41.7; // 150 km/h
const MAX_REVERSE = 8.5;
const ENGINE_POWER = 4.6; // aceleração inicial; cai com o quadrado da velocidade

/**
 * Movimento arcade no plano XZ, com derrapagem lateral. Sem dependências de
 * renderização para poder ser verificado com testes determinísticos.
 * Frente local = +Z; direita local = -X.
 */
export class VehicleMotion {
  constructor({ position = [0, 0], heading = 0 } = {}) {
    this.x = position[0] ?? 0;
    this.z = position[1] ?? 0;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.longitudinalSpeed = 0;
    this.lateralSpeed = 0;
    this.drifting = false;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get speedKmh() {
    return Math.abs(this.longitudinalSpeed) * 3.6;
  }

  get gear() {
    if (this.longitudinalSpeed < -0.4) return 'R';
    if (Math.abs(this.longitudinalSpeed) < 0.4) return 'N';
    return 'D';
  }

  setPose(x, z, heading = this.heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = this.vz = this.steer = 0;
    this.longitudinalSpeed = this.lateralSpeed = 0;
    this.drifting = false;
  }

  syncAxes() {
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    this.longitudinalSpeed = this.vx * sin + this.vz * cos;
    this.lateralSpeed = this.vx * cos - this.vz * sin;
    this.drifting = this.driftingNow();
  }

  driftingNow() {
    return Math.abs(this.lateralSpeed) > 2.4 && Math.abs(this.longitudinalSpeed) > 3;
  }

  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    const h = Math.min(dt, 0.05);
    const throttle = clamp(Number(input.throttle) || 0, -1, 1);
    const steerInput = clamp(Number(input.steer) || 0, -1, 1);
    const handbrake = input.handbrake === true;
    this.steer = damp(this.steer, steerInput, 9, h);

    let sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    let long = this.vx * sin + this.vz * cos;
    let lat = this.vx * cos - this.vz * sin;

    if (throttle > 0) {
      // Curva de potência: forte no início e progressivamente mais fraca perto de 150 km/h.
      const headroom = Math.max(0, 1 - (long / (MAX_FORWARD * 1.35)) ** 2);
      long += (long < -0.5 ? 26 : ENGINE_POWER * headroom) * throttle * h;
    } else if (throttle < 0) long += (long > 0.5 ? 26 : 7.5) * throttle * h;
    const drag = (0.3 + 0.0009 * long * long) * h;
    long -= Math.sign(long) * Math.min(Math.abs(long), drag);
    if (handbrake) long -= Math.sign(long) * Math.min(Math.abs(long), 1.8 * h);
    if (throttle === 0 && Math.abs(long) < 0.25) long = 0;
    long -= Math.abs(lat) * (handbrake ? 0.12 : 0.05) * h;
    long = clamp(long, -MAX_REVERSE, MAX_FORWARD);

    const speedFactor = Math.min(1, Math.abs(long) / 4);
    const steerRate = (handbrake ? 3.6 : 2.4) * speedFactor / (1 + Math.abs(long) * 0.022) * (long < -0.2 ? -1 : 1);
    // Esterço positivo (D) vira à direita do motorista: -X local.
    this.heading -= this.steer * steerRate * h;

    // Mantém a velocidade do mundo e mede o escorregamento nos novos eixos.
    const oldSin = sin, oldCos = cos;
    const worldX = oldSin * long + oldCos * lat;
    const worldZ = oldCos * long - oldSin * lat;
    sin = Math.sin(this.heading); cos = Math.cos(this.heading);
    long = worldX * sin + worldZ * cos;
    lat = worldX * cos - worldZ * sin;

    const grip = (handbrake ? 2.6 : 15) / (1 + Math.abs(lat) * 0.04);
    lat *= Math.exp(-grip * h);
    lat = clamp(lat, -10, 10);

    this.vx = sin * long + cos * lat;
    this.vz = cos * long - sin * lat;
    this.x += this.vx * h;
    this.z += this.vz * h;
    this.longitudinalSpeed = long;
    this.lateralSpeed = lat;
    this.drifting = this.driftingNow();
    return true;
  }
}
