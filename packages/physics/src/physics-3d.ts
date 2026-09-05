import {
  LocalTransform,
  Signal,
  definePlugin,
  defineSystem,
  isEntityActive,
  type EnginePlugin,
  type Entity,
  type Game,
  type Vec3,
} from "@natural-engine/core";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Collider,
  physicsComponents,
  RigidBody,
  type ColliderData,
  type RigidBodyData,
} from "./components.ts";

export interface Physics3DOptions {
  gravity?: Vec3;
}

export interface Collision3DEvent {
  first: Entity;
  second: Entity;
  started: boolean;
}

function key(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}

function rigidBodyDescriptor(data: RigidBodyData): RAPIER.RigidBodyDesc {
  const descriptor =
    data.type === "fixed"
      ? RAPIER.RigidBodyDesc.fixed()
      : data.type === "kinematic"
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.dynamic();
  descriptor
    .setGravityScale(data.gravityScale)
    .setCanSleep(data.canSleep)
    .setCcdEnabled(data.continuousCollisionDetection);
  return descriptor;
}

function colliderDescriptor(data: ColliderData): RAPIER.ColliderDesc {
  const descriptor =
    data.shape === "sphere"
      ? RAPIER.ColliderDesc.ball(data.radius)
      : data.shape === "capsule"
        ? RAPIER.ColliderDesc.capsule(data.height / 2, data.radius)
        : RAPIER.ColliderDesc.cuboid(data.size.x / 2, data.size.y / 2, data.size.z / 2);
  return descriptor
    .setDensity(data.density)
    .setFriction(data.friction)
    .setRestitution(data.restitution)
    .setSensor(data.sensor);
}

export class Physics3DWorld {
  readonly bodies = new Map<string, RAPIER.RigidBody>();
  readonly onCollision = new Signal<Collision3DEvent>();
  readonly #colliders = new Map<number, Entity>();
  readonly #colliderHandles = new Map<string, number>();
  readonly #signatures = new Map<string, string>();
  #world: RAPIER.World | null = null;
  #events: RAPIER.EventQueue | null = null;

  constructor(readonly options: Physics3DOptions = {}) {}

  async initialize(): Promise<void> {
    await RAPIER.init();
    this.#world = new RAPIER.World(this.options.gravity ?? { x: 0, y: -9.81, z: 0 });
    this.#events = new RAPIER.EventQueue(true);
  }

  syncAndStep(game: Game, delta: number): void {
    const world = this.#world;
    if (world === null) throw new Error("Physics 3D world is not initialized");
    const seen = new Set<string>();
    for (const row of game.world.query(LocalTransform, RigidBody, Collider)) {
      const [transform, rigidBody, collider] = row.components;
      const entityKey = key(row.entity);
      if (!isEntityActive(game.world, row.entity)) continue;
      seen.add(entityKey);
      let body = this.bodies.get(entityKey);
      const signature = JSON.stringify([rigidBody, collider]);
      if (body !== undefined && this.#signatures.get(entityKey) !== signature) {
        this.#removeBody(world, entityKey, body);
        body = undefined;
      }
      if (body === undefined) {
        const descriptor = rigidBodyDescriptor(rigidBody)
          .setTranslation(transform.position.x, transform.position.y, transform.position.z)
          .setRotation(transform.rotation);
        body = world.createRigidBody(descriptor);
        const physicsCollider = world.createCollider(
          colliderDescriptor(collider).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        this.bodies.set(entityKey, body);
        this.#colliders.set(physicsCollider.handle, row.entity);
        this.#colliderHandles.set(entityKey, physicsCollider.handle);
        this.#signatures.set(entityKey, signature);
      } else if (rigidBody.type === "kinematic") {
        body.setNextKinematicTranslation(transform.position);
        body.setNextKinematicRotation(transform.rotation);
      } else if (rigidBody.type === "fixed") {
        body.setTranslation(transform.position, false);
        body.setRotation(transform.rotation, false);
      }
    }
    for (const [entityKey, body] of this.bodies) {
      if (!seen.has(entityKey)) {
        this.#removeBody(world, entityKey, body);
      }
    }
    world.timestep = delta;
    world.step(this.#events ?? undefined);
    this.#events?.drainCollisionEvents((firstHandle, secondHandle, started) => {
      const first = this.#colliders.get(firstHandle);
      const second = this.#colliders.get(secondHandle);
      if (first !== undefined && second !== undefined)
        this.onCollision.emit({ first, second, started });
    });
    for (const row of game.world.query(LocalTransform, RigidBody)) {
      const [transform, rigidBody] = row.components;
      if (rigidBody.type !== "dynamic") continue;
      const body = this.bodies.get(key(row.entity));
      if (body === undefined) continue;
      const translation = body.translation();
      const rotation = body.rotation();
      transform.position = { x: translation.x, y: translation.y, z: translation.z };
      transform.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
    }
  }

  setLinearVelocity(entity: Entity, velocity: Vec3, wake = true): void {
    const body = this.bodies.get(key(entity));
    if (body === undefined) throw new Error("Entity has no 3D physics body");
    body.setLinvel(velocity, wake);
  }

  applyImpulse(entity: Entity, impulse: Vec3, wake = true): void {
    const body = this.bodies.get(key(entity));
    if (body === undefined) throw new Error("Entity has no 3D physics body");
    body.applyImpulse(impulse, wake);
  }

  castRay(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    solid = true,
  ): RAPIER.RayColliderHit | null {
    if (this.#world === null) throw new Error("Physics 3D world is not initialized");
    return this.#world.castRay(new RAPIER.Ray(origin, direction), maxDistance, solid);
  }

  dispose(): void {
    this.bodies.clear();
    this.#colliders.clear();
    this.#colliderHandles.clear();
    this.#signatures.clear();
    this.onCollision.clear();
    this.#events?.free();
    this.#events = null;
    this.#world?.free();
    this.#world = null;
  }

  #removeBody(world: RAPIER.World, entityKey: string, body: RAPIER.RigidBody): void {
    world.removeRigidBody(body);
    const colliderHandle = this.#colliderHandles.get(entityKey);
    if (colliderHandle !== undefined) this.#colliders.delete(colliderHandle);
    this.#colliderHandles.delete(entityKey);
    this.#signatures.delete(entityKey);
    this.bodies.delete(entityKey);
  }
}

export function createPhysics3DPlugin(
  options: Physics3DOptions = {},
): EnginePlugin & { physics: Physics3DWorld } {
  const physics = new Physics3DWorld(options);
  const plugin = {
    id: "natural.physics-3d",
    physics,
    setup: async (game: Game) => {
      for (const component of physicsComponents) game.world.register(component);
      await physics.initialize();
      game.scheduler.add(
        defineSystem({
          name: "natural.physics-3d.step",
          stage: "physics",
          run: ({ delta }: { delta: number }) => physics.syncAndStep(game, delta),
        }),
      );
    },
    dispose: () => physics.dispose(),
  };
  return definePlugin(plugin) as EnginePlugin & { physics: Physics3DWorld };
}
