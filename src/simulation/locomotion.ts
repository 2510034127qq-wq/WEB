/**
 * First-person walking in metres and seconds. The view follows the body's gait;
 * mouse look remains immediate. Collision-resolved travel, not held keys or wall
 * clock time, determines the alternating foot contacts.
 */
export interface WalkInput {
  /** World-space desired direction. Diagonals are normalised internally. */
  x: number;
  z: number;
  yaw: number;
  run?: boolean;
  crouch?: boolean;
  carrying?: boolean;
  /** False while working at a bench, in a modal, or paused. */
  enabled?: boolean;
  /** Turning this off removes view motion, retaining the crouched eye height. */
  bob?: boolean;
}

export interface Travel {
  x: number;
  z: number;
}

export interface FootContact {
  foot: "left" | "right";
  /** 0..1; useful for volume and the cloth/sole sound blend. */
  strength: number;
}

export interface MotionPose {
  /** Camera-local metres: +x right, +z backwards. Includes crouched eye height. */
  offset: { x: number; y: number; z: number };
  /** Small view rotations in radians, applied in addition to mouse look. */
  pitch: number;
  roll: number;
  /** Torso heading trails the eyes; use for held hands/shoulder orientation. */
  bodyYaw: number;
  headLag: number;
  speed: number;
  /** Fraction of the current left/right step, 0..1. */
  phase: number;
  crouch: number;
  steps: FootContact[];
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

export class Locomotion {
  private velocity: Travel = { x: 0, z: 0 };
  private requested: Travel = { x: 0, z: 0 };
  private input: WalkInput = { x: 0, z: 0, yaw: 0 };
  private initialized = false;
  private bodyYaw = 0;
  private clock = 0;
  private stride = 0.5;
  private contactNumber = 0;
  private strideLength = 0.67;
  private running = 0;
  private crouch = 0;
  private activity = 0;
  private actualSpeed = 0;
  private localForward = 0;
  private localSide = 0;
  private lean = 0;
  private bank = 0;
  private impact = 0;
  private impactVelocity = 0;

  /** Call once before the character controller, then pass its displacement in observe. */
  plan(input: WalkInput, seconds: number): Travel {
    const dt = clamp(finite(seconds), 0, 0.05);
    this.input = {
      ...input,
      x: finite(input.x),
      z: finite(input.z),
      yaw: finite(input.yaw),
    };
    if (!this.initialized) {
      this.bodyYaw = this.input.yaw;
      this.initialized = true;
    }
    const active = input.enabled !== false;
    this.clock += dt;
    this.crouch = mix(this.crouch, active && input.crouch ? 1 : 0, ease(9, dt));
    this.running = mix(
      this.running,
      active && input.run && !input.crouch && !input.carrying ? 1 : 0,
      ease(5, dt),
    );
    // Eyes lead the torso by a few degrees. A quick turn recruits the body sooner.
    const difference = angle(this.input.yaw - this.bodyYaw);
    this.bodyYaw += difference * ease(Math.abs(difference) > 0.7 ? 8 : 3.5, dt);
    this.bodyYaw =
      this.input.yaw - clamp(angle(this.input.yaw - this.bodyYaw), -0.8, 0.8);

    if (!active || dt === 0) {
      this.velocity = { x: 0, z: 0 };
      this.requested = { x: 0, z: 0 };
      return { ...this.requested };
    }
    const size = Math.hypot(this.input.x, this.input.z);
    const scale = size > 1 ? 1 / size : 1;
    const x = this.input.x * scale;
    const z = this.input.z * scale;
    const forward =
      -Math.sin(this.input.yaw) * x - Math.cos(this.input.yaw) * z;
    // Backward steps and lateral shuffling are shorter than normal forward walking.
    const directionSpeed =
      forward < 0 ? mix(1, 0.7, -forward) : mix(0.84, 1, forward);
    const speed =
      (input.crouch ? 0.66 : input.run && !input.carrying ? 3.15 : 1.48) *
      directionSpeed *
      (input.carrying ? 0.86 : 1);
    const targetX = x * speed;
    const targetZ = z * speed;
    // Exact integration of a damped velocity avoids frame-rate-dependent travel.
    const rate = size < 0.001 ? 13 : input.crouch ? 7 : 7.8;
    const decay = Math.exp(-rate * dt);
    const integrated = (1 - decay) / rate;
    this.requested = {
      x: targetX * dt + (this.velocity.x - targetX) * integrated,
      z: targetZ * dt + (this.velocity.z - targetZ) * integrated,
    };
    this.velocity.x = targetX + (this.velocity.x - targetX) * decay;
    this.velocity.z = targetZ + (this.velocity.z - targetZ) * decay;
    return { ...this.requested };
  }

  /** Feed actual post-collision planar displacement. Calling with zero cannot make footsteps. */
  observe(travel: Travel, seconds: number): MotionPose {
    const dt = clamp(finite(seconds), 0, 0.05);
    const active = this.input.enabled !== false;
    const dx = active ? finite(travel.x) : 0;
    const dz = active ? finite(travel.z) : 0;
    const distance = Math.hypot(dx, dz);
    const measuredSpeed = dt > 0 ? distance / dt : 0;
    // A wall consumes velocity instead of storing momentum behind the obstacle.
    for (const axis of ["x", "z"] as const) {
      const requested = this.requested[axis];
      const actual = axis === "x" ? dx : dz;
      if (
        Math.abs(requested) > 1e-6 &&
        Math.abs(actual) < Math.abs(requested) * 0.8
      )
        this.velocity[axis] *= clamp(actual / requested, 0, 1);
    }
    this.actualSpeed = mix(this.actualSpeed, measuredSpeed, ease(16, dt));
    this.activity = mix(
      this.activity,
      clamp(this.actualSpeed / 1.35, 0, 1),
      ease(10, dt),
    );
    this.strideLength = mix(
      this.strideLength,
      mix(mix(0.67, 1.04, this.running), 0.42, this.crouch),
      ease(7, dt),
    );
    const steps: FootContact[] = [];
    // Disregard large teleports (load/save/bench transitions), never replay footfalls for them.
    if (dt > 0 && distance > 0 && measuredSpeed < 6) {
      this.stride += distance / this.strideLength;
      while (this.stride >= 1) {
        this.stride -= 1;
        const strength =
          clamp(0.24 + measuredSpeed * 0.2, 0.24, 1) * (1 - this.crouch * 0.45);
        steps.push({
          foot: this.contactNumber++ % 2 === 0 ? "left" : "right",
          strength,
        });
        this.impactVelocity -= 0.13 * strength;
      }
    }
    // A heel strike compresses, then releases, the body. Critically damped spring
    // solved analytically so low frame rates cannot make it oscillate or explode.
    const spring = 23;
    const decay = Math.exp(-spring * dt);
    const springSum = this.impactVelocity + spring * this.impact;
    this.impact = (this.impact + springSum * dt) * decay;
    this.impactVelocity =
      (this.impactVelocity - spring * springSum * dt) * decay;
    const localForward =
      dt > 0
        ? (-Math.sin(this.input.yaw) * dx - Math.cos(this.input.yaw) * dz) / dt
        : 0;
    const localSide =
      dt > 0
        ? (Math.cos(this.input.yaw) * dx - Math.sin(this.input.yaw) * dz) / dt
        : 0;
    const acceleration =
      dt > 0 ? clamp((localForward - this.localForward) / dt, -8, 8) : 0;
    this.localForward = mix(this.localForward, localForward, ease(12, dt));
    this.localSide = mix(this.localSide, localSide, ease(9, dt));
    this.lean = mix(this.lean, acceleration * 0.0014, ease(9, dt));
    this.bank = mix(this.bank, -this.localSide * 0.005, ease(7, dt));
    const leg = this.contactNumber % 2 === 0 ? 1 : -1;
    const arch = Math.sin(this.stride * Math.PI);
    const side = Math.cos(this.stride * Math.PI) * leg;
    const gait = this.activity * (1 - this.crouch * 0.5);
    const headLag = angle(this.input.yaw - this.bodyYaw);
    const motion = this.input.bob === false ? 0 : active ? 1 : 0;
    const breath = Math.sin(this.clock * (1.35 + this.running * 0.7)) * 0.0012;
    return {
      offset: {
        x: (side * 0.012 * gait + headLag * 0.003) * motion,
        y:
          -0.48 * this.crouch +
          (arch * (0.017 + this.running * 0.01) * gait + this.impact + breath) *
            motion,
        z:
          (Math.sin(this.stride * Math.PI * 2) * 0.004 * gait +
            this.lean * 0.25) *
          motion,
      },
      pitch:
        (this.lean +
          Math.sin(this.stride * Math.PI * 2) * 0.0028 * gait +
          this.impact * 0.2) *
        motion,
      roll: (this.bank + side * 0.0038 * gait - headLag * 0.003) * motion,
      bodyYaw: this.bodyYaw,
      headLag,
      speed: this.actualSpeed,
      phase: this.stride,
      crouch: this.crouch,
      steps,
    };
  }

  /** Use after restoring a save or entering a fixed workbench view. */
  reset(yaw = 0) {
    this.velocity = { x: 0, z: 0 };
    this.requested = { x: 0, z: 0 };
    this.bodyYaw = finite(yaw);
    this.input = { x: 0, z: 0, yaw: finite(yaw) };
    this.initialized = true;
    this.activity = this.actualSpeed = this.localForward = this.localSide = 0;
    this.impact = this.impactVelocity = this.lean = this.bank = 0;
    this.stride = 0.5;
    this.contactNumber = 0;
    this.crouch = this.running = 0;
  }
}
