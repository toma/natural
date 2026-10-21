import {
  LocalTransform,
  Signal,
  definePlugin,
  defineSystem,
  isEntityActive,
  type EnginePlugin,
  type Entity,
  type Game,
  type Vec2,
} from "@toma.com/core";
import RAPIER from "@dimforge/rapier2d-compat";
import {
  Collider,
  physicsComponents,
  RigidBody,
  type ColliderData,
  type RigidBodyData,
} from "./components.ts";

export interface Physics2DOptions {
  gravity?: Vec2;
}

export interface CollisionEvent {
  first: Entity;
  second: Entity;
  started: boolean;
}

const entityKey = (entity: Entity): string => `${entity.index}:${entity.generation}`;

function bodyDescriptor(data: RigidBodyData): RAPIER.RigidBodyDesc {
  const descriptor =
    data.type === "fixed"
      ? RAPIER.RigidBodyDesc.fixed()
      : data.type === "kinematic"
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.dynamic();
  return descriptor
    .setGravityScale(data.gravityScale)
    .setCanSleep(data.canSleep)
    .setCcdEnabled(data.continuousCollisionDetection);
}

function shapeDescriptor(data: ColliderData): RAPIER.ColliderDesc {
  const descriptor =
    data.shape === "sphere"
      ? RAPIER.ColliderDesc.ball(data.radius)
      : data.shape === "capsule"
        ? RAPIER.ColliderDesc.capsule(data.height / 2, data.radius)
        : RAPIER.ColliderDesc.cuboid(data.size.x / 2, data.size.y / 2);
  return descriptor
    .setDensity(data.density)
    .setFriction(data.friction)
    .setRestitution(data.restitution)
    .setSensor(data.sensor);
}

export class Physics2DWorld {
  readonly bodies = new Map<string, RAPIER.RigidBody>();
  readonly onCollision = new Signal<CollisionEvent>();
  readonly #colliders = new Map<number, Entity>();
  readonly #colliderHandles = new Map<string, number>();
  readonly #signatures = new Map<string, string>();
  #world: RAPIER.World | null = null;
  #events: RAPIER.EventQueue | null = null;

  constructor(readonly options: Physics2DOptions = {}) {}

  async initialize(): Promise<void> {
    await RAPIER.init();
    this.#world = new RAPIER.World(this.options.gravity ?? { x: 0, y: -9.81 });
    this.#events = new RAPIER.EventQueue(true);
  }

  syncAndStep(game: Game, delta: number): void {
    const world = this.#world;
    if (world === null) throw new Error("Physics 2D world is not initialized");
    const seen = new Set<string>();
    for (const row of game.world.query(LocalTransform, RigidBody, Collider)) {
      const [transform, rigidBody, collider] = row.components;
      const key = entityKey(row.entity);
      if (!isEntityActive(game.world, row.entity)) continue;
      seen.add(key);
      let body = this.bodies.get(key);
      const signature = JSON.stringify([rigidBody, collider]);
      if (body !== undefined && this.#signatures.get(key) !== signature) {
        this.#removeBody(world, key, body);
        body = undefined;
      }
      const angle = Math.atan2(
        2 * transform.rotation.w * transform.rotation.z,
        1 - 2 * transform.rotation.z ** 2,
      );
      if (body === undefined) {
        body = world.createRigidBody(
          bodyDescriptor(rigidBody)
            .setTranslation(transform.position.x, transform.position.y)
            .setRotation(angle),
        );
        const physicsCollider = world.createCollider(
          shapeDescriptor(collider).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        this.bodies.set(key, body);
        this.#colliders.set(physicsCollider.handle, row.entity);
        this.#colliderHandles.set(key, physicsCollider.handle);
        this.#signatures.set(key, signature);
      } else if (rigidBody.type === "kinematic") {
        body.setNextKinematicTranslation(transform.position);
        body.setNextKinematicRotation(angle);
      } else if (rigidBody.type === "fixed") {
        body.setTranslation(transform.position, false);
        body.setRotation(angle, false);
      }
    }
    for (const [key, body] of this.bodies) {
      if (!seen.has(key)) {
        this.#removeBody(world, key, body);
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
      if (row.components[1].type !== "dynamic") continue;
      const body = this.bodies.get(entityKey(row.entity));
      if (body === undefined) continue;
      const translation = body.translation();
      const halfAngle = body.rotation() / 2;
      row.components[0].position.x = translation.x;
      row.components[0].position.y = translation.y;
      row.components[0].rotation = { x: 0, y: 0, z: Math.sin(halfAngle), w: Math.cos(halfAngle) };
    }
  }

  castRay(
    origin: Vec2,
    direction: Vec2,
    maxDistance: number,
    solid = true,
  ): RAPIER.RayColliderHit | null {
    if (this.#world === null) throw new Error("Physics 2D world is not initialized");
    return this.#world.castRay(new RAPIER.Ray(origin, direction), maxDistance, solid);
  }

  setLinearVelocity(entity: Entity, velocity: Vec2, wake = true): void {
    const body = this.bodies.get(entityKey(entity));
    if (body === undefined) throw new Error("Entity has no 2D physics body");
    body.setLinvel(velocity, wake);
  }

  applyImpulse(entity: Entity, impulse: Vec2, wake = true): void {
    const body = this.bodies.get(entityKey(entity));
    if (body === undefined) throw new Error("Entity has no 2D physics body");
    body.applyImpulse(impulse, wake);
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

  #removeBody(world: RAPIER.World, key: string, body: RAPIER.RigidBody): void {
    world.removeRigidBody(body);
    const colliderHandle = this.#colliderHandles.get(key);
    if (colliderHandle !== undefined) this.#colliders.delete(colliderHandle);
    this.#colliderHandles.delete(key);
    this.#signatures.delete(key);
    this.bodies.delete(key);
  }
}

export function createPhysics2DPlugin(
  options: Physics2DOptions = {},
): EnginePlugin & { physics: Physics2DWorld } {
  const physics = new Physics2DWorld(options);
  const plugin = {
    id: "natural.physics-2d",
    physics,
    setup: async (game: Game) => {
      for (const component of physicsComponents) game.world.register(component);
      await physics.initialize();
      game.scheduler.add(
        defineSystem({
          name: "natural.physics-2d.step",
          stage: "physics",
          run: ({ delta }: { delta: number }) => physics.syncAndStep(game, delta),
        }),
      );
    },
    dispose: () => physics.dispose(),
  };
  return definePlugin(plugin) as EnginePlugin & { physics: Physics2DWorld };
}
