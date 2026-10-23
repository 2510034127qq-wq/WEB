import RAPIER from "@dimforge/rapier3d-compat";
import type { Vec3 } from "../simulation/model";
export class Physics {
  world!: RAPIER.World;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.KinematicCharacterController;
  private hotDoor!: RAPIER.Collider;
  private propBodies = new Map<string, RAPIER.RigidBody>();
  async init(pos: Vec3, props: Record<string, Vec3>) {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const box = (p: Vec3, s: Vec3) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2).setTranslation(
          ...p,
        ),
      );
    box([0, -0.1, 0], [20, 0.2, 20]);
    box([0, 1.5, -8], [18, 3, 0.3]);
    for (const x of [-9, 9]) box([x, 1.5, 0], [0.3, 3, 16]);
    for (const x of [-6, 6]) box([x, 1.5, 8], [6, 3, 0.3]);
    box([0, 1, 9.6], [20, 2, 0.3]);
    for (const p of [
      [-5.6, 0.5, -5.6],
      [5.4, 0.5, -5.6],
      [-6, 0.5, 5],
      [0, 0.5, 5.8],
    ] as Vec3[])
      box(p, [2.5, 1, 1.2]);
    box([-7.45, 1, -0.2], [1.3, 2.2, 4.2]);
    box([7.2, 0.5, -0.2], [1.5, 1, 2.3]);
    box([0, 0.4, -5.6], [1.3, 0.8, 1.3]);
    box([0, 0.25, -4.62], [0.9, 0.5, 0.4]);
    box([4.47, 1.2, 5.8], [0.3, 2.4, 4.1]);
    box([7.53, 1.2, 5.8], [0.3, 2.4, 4.1]);
    box([6, 1.2, 7.75], [3.3, 2.4, 0.25]);
    box([6, 0.15, 5.8], [3.3, 0.3, 4.1]);
    box([3.95, 0.4, 6.8], [0.8, 0.8, 2]);
    this.hotDoor = box([6, 1.2, 3.94], [2.9, 2.4, 0.18]);
    this.hotDoor.setEnabled(false);
    for (const [x, z] of [
      [-8.67, -4.85],
      [-2.95, -4.85],
      [2.95, -4.85],
      [8.67, -4.85],
      [-8.6, 3.15],
      [-5.9, 3.15],
      [5.68, 1.7],
      [8.52, 1.7],
      [3.18, 3.45],
      [8.42, 3.45],
    ])
      box([x, 1.5, z], [0.18, 3, 0.18]);
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        pos[0],
        0.85,
        pos[2],
      ),
    );
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.56, 0.26),
      this.body,
    );
    this.controller = this.world.createCharacterController(0.015);
    this.controller.enableAutostep(0.12, 0.2, false);
    this.controller.enableSnapToGround(0.25);
    this.world.step();
    for (const [id, p] of Object.entries(props)) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...p)
          .lockRotations()
          .setLinearDamping(2),
      );
      const collider =
        id === "sagger"
          ? RAPIER.ColliderDesc.cylinder(0.17, 0.25).setTranslation(0, 0.17, 0)
          : RAPIER.ColliderDesc.cuboid(
              0.012,
              0.012,
              id === "bamboo" ? 0.425 : 0.135,
            );
      this.world.createCollider(
        collider.setFriction(0.9).setRestitution(0.04),
        body,
      );
      this.propBodies.set(id, body);
    }
  }
  setKilnHot(hot: boolean) {
    this.hotDoor.setEnabled(hot);
  }
  syncProps(props: Record<string, Vec3>, held: string | null) {
    for (const [id, body] of this.propBodies) {
      body.setEnabled(id !== held);
      if (id !== held) {
        const p = body.translation();
        props[id] = [p.x, p.y, p.z];
      }
    }
  }
  releaseProp(id: string, p: Vec3) {
    const body = this.propBodies.get(id);
    if (body) {
      body.setEnabled(true);
      body.setTranslation({ x: p[0], y: p[1] + 0.08, z: p[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  restoreProps(props: Record<string, Vec3>) {
    for (const [id, p] of Object.entries(props)) {
      const body = this.propBodies.get(id);
      if (body) {
        body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }
  move(dx: number, dz: number, dt: number): Vec3 {
    this.controller.computeColliderMovement(this.collider, {
      x: dx,
      y: -9.81 * dt,
      z: dz,
    });
    const m = this.controller.computedMovement(),
      p = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: p.x + m.x,
      y: p.y + m.y,
      z: p.z + m.z,
    });
    this.world.timestep = dt;
    this.world.step();
    const q = this.body.translation();
    return [q.x, q.y + 0.8, q.z];
  }
}
