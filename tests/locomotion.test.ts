import { describe, expect, it } from "vitest";
import {
  Locomotion,
  type WalkInput,
  type MotionPose,
} from "../src/simulation/locomotion";

const walk: WalkInput = { x: 0, z: -1, yaw: 0 };
function drive(
  gait: Locomotion,
  input: WalkInput,
  seconds: number,
  fps = 60,
  blocked = false,
) {
  let distance = 0;
  const contacts: string[] = [];
  let pose!: MotionPose;
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    const requested = gait.plan(input, 1 / fps);
    const actual = blocked ? { x: 0, z: 0 } : requested;
    distance += Math.hypot(actual.x, actual.z);
    pose = gait.observe(actual, 1 / fps);
    contacts.push(...pose.steps.map((s) => s.foot));
  }
  return { distance, contacts, pose };
}

describe("body-driven first person locomotion", () => {
  it("accelerates into walking and arrests smoothly after release, without diagonal boost", () => {
    const gait = new Locomotion();
    const first = drive(gait, walk, 1 / 60);
    expect(first.distance * 60).toBeLessThan(0.2);
    expect(drive(gait, walk, 1).pose.speed).toBeGreaterThan(1.4);
    const released = drive(gait, { ...walk, z: 0 }, 0.5);
    expect(released.distance).toBeGreaterThan(0.05);
    expect(released.distance).toBeLessThan(0.13);
    expect(released.pose.speed).toBeLessThan(0.02);
    const diagonal = drive(new Locomotion(), { ...walk, x: 1 }, 4);
    const straight = drive(new Locomotion(), walk, 4);
    expect(diagonal.distance).toBeLessThanOrEqual(straight.distance);
    expect(diagonal.distance).toBeGreaterThan(straight.distance * 0.9);
  });

  it("ties alternating footfalls to actual distance and emits none while pushing into a wall", () => {
    const gait = new Locomotion();
    expect(drive(gait, walk, 3, 60, true).contacts).toHaveLength(0);
    const result = drive(gait, walk, 4);
    expect(result.contacts.length).toBeGreaterThan(6);
    expect(
      result.contacts.every(
        (foot, i) => i === 0 || foot !== result.contacts[i - 1],
      ),
    ).toBe(true);
    expect(drive(gait, walk, 2, 60, true).contacts).toHaveLength(0);
    expect(drive(gait, { ...walk, z: 0 }, 2).pose.speed).toBeLessThan(0.001);
  });

  it("integrates the same walk and footfalls at 30, 60 and 120 Hz", () => {
    const results = [30, 60, 120].map((fps) =>
      drive(new Locomotion(), walk, 8, fps),
    );
    for (const result of results.slice(1)) {
      expect(result.distance).toBeCloseTo(results[0].distance, 8);
      expect(result.contacts).toEqual(results[0].contacts);
      expect(result.pose.offset.y).toBeCloseTo(results[0].pose.offset.y, 2);
    }
  });

  it("lowers crouching smoothly and provides a motion-free comfort option", () => {
    const gait = new Locomotion();
    const start = drive(
      gait,
      { ...walk, crouch: true, bob: false },
      1 / 60,
    ).pose;
    expect(start.offset.y).toBeLessThan(0);
    expect(start.offset.y).toBeGreaterThan(-0.1);
    const down = drive(gait, { ...walk, crouch: true, bob: false }, 2).pose;
    expect(down.offset.y).toBeCloseTo(-0.48, 5);
    expect(down.offset.x).toBeCloseTo(0, 8);
    expect(down.offset.z).toBeCloseTo(0, 8);
    expect(down.pitch).toBeCloseTo(0, 8);
    expect(down.roll).toBeCloseTo(0, 8);
    expect(down.speed).toBeCloseTo(0.66, 3);
    expect(
      drive(gait, { ...walk, z: 0, bob: false }, 2).pose.offset.y,
    ).toBeCloseTo(0, 5);
  });

  it("limits carrying to careful walking, and head-first turns settle without angle wrap jumps", () => {
    const carrying = drive(
      new Locomotion(),
      { ...walk, run: true, carrying: true },
      2,
    );
    const running = drive(new Locomotion(), { ...walk, run: true }, 2);
    expect(carrying.pose.speed).toBeLessThan(1.3);
    expect(running.pose.speed).toBeGreaterThan(3);
    const gait = new Locomotion();
    gait.reset(Math.PI - 0.05);
    const turn = drive(gait, { x: 0, z: 0, yaw: -Math.PI + 0.05 }, 1 / 60).pose;
    expect(turn.headLag).toBeGreaterThan(0);
    expect(turn.headLag).toBeLessThan(0.1);
    expect(
      drive(gait, { x: 0, z: 0, yaw: -Math.PI + 0.05 }, 2).pose.headLag,
    ).toBeCloseTo(0, 3);
  });

  it("keeps view motion bounded and suppresses momentum and footsteps at a workbench", () => {
    const gait = new Locomotion();
    for (let i = 0; i < 600; i++) {
      const input = {
        ...walk,
        x: Math.sin(i * 0.1),
        run: i % 120 > 60,
        yaw: i * 0.01,
      };
      const requested = gait.plan(input, 1 / 60);
      const pose = gait.observe(requested, 1 / 60);
      expect(Math.abs(pose.offset.x)).toBeLessThan(0.02);
      expect(Math.abs(pose.offset.y)).toBeLessThan(0.04);
      expect(Math.abs(pose.roll)).toBeLessThan(0.03);
      expect(Math.abs(pose.pitch)).toBeLessThan(0.03);
    }
    const disabled = drive(gait, { ...walk, enabled: false }, 0.5);
    expect(disabled.distance).toBe(0);
    expect(disabled.contacts).toHaveLength(0);
    expect(Math.hypot(...Object.values(disabled.pose.offset))).toBe(0);
  });
});
