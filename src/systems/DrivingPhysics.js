import { MathUtils } from 'three';

// Velocity is retained in the car's forward/right frame as the body turns.
export function advanceDriving(state, throttle, steer, handbrake, dt) {
  throttle = MathUtils.clamp(throttle, -1, 1);
  steer = MathUtils.clamp(steer, -1, 1);
  state.steering = MathUtils.damp(state.steering, steer, 5, dt);
  state.speed += throttle * 9 * dt;
  state.speed *= Math.exp(-(handbrake ? 0.85 : throttle ? 0.15 : 0.8) * dt);
  state.speed = MathUtils.clamp(state.speed, -7, 28);
  const speed = Math.abs(state.speed);
  const turn =
    -state.steering *
    Math.min(speed / 8, 1) *
    Math.sign(state.speed) *
    (1.15 / (1 + speed / 42)) *
    (handbrake ? 1.5 : 1) *
    dt;
  state.heading += turn;
  const forward = state.speed * Math.cos(turn) - state.lateralSpeed * Math.sin(turn);
  const sideways = state.lateralSpeed * Math.cos(turn) + state.speed * Math.sin(turn);
  state.speed = forward;
  state.lateralSpeed = sideways * Math.exp(-(handbrake && speed > 5 ? 0.65 : 5) * dt);
  return {
    x: (-Math.sin(state.heading) * state.speed + Math.cos(state.heading) * state.lateralSpeed) * dt,
    z: (-Math.cos(state.heading) * state.speed - Math.sin(state.heading) * state.lateralSpeed) * dt,
  };
}
