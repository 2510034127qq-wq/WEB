import RAPIER from '@dimforge/rapier3d-compat';
import type {Vec3} from '../simulation/model';
export class Physics {
  world!:RAPIER.World;body!:RAPIER.RigidBody;collider!:RAPIER.Collider;controller!:RAPIER.KinematicCharacterController;
  async init(pos:Vec3){await RAPIER.init();this.world=new RAPIER.World({x:0,y:-9.81,z:0});
    const box=(p:Vec3,s:Vec3)=>this.world.createCollider(RAPIER.ColliderDesc.cuboid(s[0]/2,s[1]/2,s[2]/2).setTranslation(...p));
    box([0,-0.1,0],[20,0.2,20]);box([0,1.5,-8],[18,3,0.3]);for(const x of [-9,9])box([x,1.5,0],[0.3,3,16]);for(const x of [-6,6])box([x,1.5,8],[6,3,0.3]);box([0,1,9.6],[20,2,0.3]);
    for(const p of [[-5.6,0.5,-5.6],[5.4,0.5,-5.6],[-6,0.5,5],[0,0.5,5.8]] as Vec3[])box(p,[2.5,1,1.2]);
    box([-7.45,1,-0.2],[1.3,2.2,4.2]);box([7.2,0.5,-0.2],[1.5,1,2.3]);box([0,0.4,-5.6],[1.3,0.8,1.3]);box([0,0.25,-4.62],[0.9,0.5,0.4]);
    box([6,1.2,5.8],[3.3,2.4,4.1]);box([3.95,0.4,6.8],[0.8,0.8,2]);
    for(const [x,z] of [[-8.67,-4.85],[-2.95,-4.85],[2.95,-4.85],[8.67,-4.85],[-8.6,3.15],[-5.9,3.15],[5.68,1.7],[8.52,1.7],[3.18,3.45],[8.42,3.45]])box([x,1.5,z],[0.18,3,0.18]);
    this.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0],0.85,pos[2]));this.collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(0.56,0.26),this.body);this.controller=this.world.createCharacterController(0.015);this.controller.enableAutostep(0.12,0.2,false);this.controller.enableSnapToGround(0.25);this.world.step();
  }
  move(dx:number,dz:number,dt:number):Vec3{this.controller.computeColliderMovement(this.collider,{x:dx,y:-9.81*dt,z:dz});const m=this.controller.computedMovement(),p=this.body.translation();this.body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});this.world.timestep=dt;this.world.step();const q=this.body.translation();return [q.x,q.y+0.8,q.z];}
}
