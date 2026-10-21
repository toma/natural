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
} from "@toma.com/core";
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
  characterController?: Partial<CharacterControllerOptions>;
}

export interface CharacterControllerOptions {
  offset: number;
  maxStepHeight: number;
  minStepWidth: number;
  maxSlopeClimbAngle: number;
  minSlopeSlideAngle: number;
  snapToGroundDistance: number;
}

export interface CharacterCollision3D {
  entity?: Entity;
  point: Vec3;
  normal: Vec3;
}

export interface CharacterMove3DResult {
  movement: Vec3;
  grounded: boolean;
  collisions: readonly CharacterCollision3D[];
}

export interface EntityRayHit3D {
  entity: Entity;
  colliderHandle: number;
  distance: number;
  point: Vec3;
  normal: Vec3;
}

const defaultCharacterController: CharacterControllerOptions = {
  offset: 0.02,
  maxStepHeight: 0.4,
  minStepWidth: 0.25,
  maxSlopeClimbAngle: Math.PI / 4,
  minSlopeSlideAngle: Math.PI / 3,
  snapToGroundDistance: 0.25,
};

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
  #characterController: RAPIER.KinematicCharacterController | null = null;
  readonly #characterOptions: CharacterControllerOptions;

  constructor(readonly options: Physics3DOptions = {}) {
    const characterOptions = { ...defaultCharacterController, ...options.characterController };
    for (const [name, value] of Object.entries(characterOptions)) {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`Character controller ${name} must be finite and positive`);
    }
    this.#characterOptions = characterOptions;
  }

  async initialize(): Promise<void> {
    await RAPIER.init();
    this.#world = new RAPIER.World(this.options.gravity ?? { x: 0, y: -9.81, z: 0 });
    this.#events = new RAPIER.EventQueue(true);
    const controller = this.#world.createCharacterController(this.#characterOptions.offset);
    controller.enableAutostep(
      this.#characterOptions.maxStepHeight,
      this.#characterOptions.minStepWidth,
      false,
    );
    controller.setMaxSlopeClimbAngle(this.#characterOptions.maxSlopeClimbAngle);
    controller.setMinSlopeSlideAngle(this.#characterOptions.minSlopeSlideAngle);
    controller.enableSnapToGround(this.#characterOptions.snapToGroundDistance);
    this.#characterController = controller;
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

  castRayEntity(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    solid = true,
    excludeEntities: readonly Entity[] = [],
  ): EntityRayHit3D | null {
    if (this.#world === null) throw new Error("Physics 3D world is not initialized");
    if (
      ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite)
    )
      throw new Error("Ray origin and direction must be finite");
    if (!Number.isFinite(maxDistance) || maxDistance <= 0)
      throw new Error("Ray maximum distance must be finite and positive");
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) throw new Error("Ray direction must not be zero");
    const normalized = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
    const ray = new RAPIER.Ray(origin, normalized);
    const excluded = new Set(excludeEntities.map(key));
    const hit = this.#world.castRayAndGetNormal(
      ray,
      maxDistance,
      solid,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const entity = this.#colliders.get(collider.handle);
        return entity === undefined || !excluded.has(key(entity));
      },
    );
    if (hit === null) return null;
    const entity = this.#colliders.get(hit.collider.handle);
    if (entity === undefined) return null;
    return {
      entity,
      colliderHandle: hit.collider.handle,
      distance: hit.timeOfImpact,
      point: ray.pointAt(hit.timeOfImpact),
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
    };
  }

  moveCharacter(game: Game, entity: Entity, desiredMovement: Vec3): CharacterMove3DResult {
    const world = this.#world;
    const controller = this.#characterController;
    if (world === null || controller === null)
      throw new Error("Physics 3D world is not initialized");
    if (![desiredMovement.x, desiredMovement.y, desiredMovement.z].every(Number.isFinite))
      throw new Error("Character movement must be finite");
    const body = this.bodies.get(key(entity));
    const colliderHandle = this.#colliderHandles.get(key(entity));
    if (body === undefined || colliderHandle === undefined)
      throw new Error("Entity has no 3D physics body");
    if (!body.isKinematic()) throw new Error("Character body must be kinematic");
    const collider = world.getCollider(colliderHandle);
    controller.computeColliderMovement(collider, desiredMovement);
    const movement = controller.computedMovement();
    const current = body.translation();
    const position = {
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z,
    };
    body.setNextKinematicTranslation(position);
    game.world.require(entity, LocalTransform).position = position;
    const collisions: CharacterCollision3D[] = [];
    for (let index = 0; index < controller.numComputedCollisions(); index += 1) {
      const collision = controller.computedCollision(index);
      if (collision === null) continue;
      const collisionEntity =
        collision.collider === null ? undefined : this.#colliders.get(collision.collider.handle);
      collisions.push({
        ...(collisionEntity === undefined ? {} : { entity: collisionEntity }),
        point: {
          x: collision.witness1.x,
          y: collision.witness1.y,
          z: collision.witness1.z,
        },
        normal: { x: collision.normal1.x, y: collision.normal1.y, z: collision.normal1.z },
      });
    }
    return {
      movement: { x: movement.x, y: movement.y, z: movement.z },
      grounded: controller.computedGrounded(),
      collisions,
    };
  }

  dispose(): void {
    this.bodies.clear();
    this.#colliders.clear();
    this.#colliderHandles.clear();
    this.#signatures.clear();
    this.onCollision.clear();
    this.#events?.free();
    this.#events = null;
    if (this.#world !== null && this.#characterController !== null)
      this.#world.removeCharacterController(this.#characterController);
    this.#characterController = null;
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
