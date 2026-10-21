import * as THREE from "three";
import { flashExposure } from "./state.ts";

/** Player equipment shares the fixed simulation clock and collision world. */
export class Equipment {
  constructor(match) {
    this.match = match;
    this.ctx = match.ctx;
    this.physics = this.ctx.get("physics");
    this.root = new THREE.Group();
    this.root.name = "match-equipment";
    this.ctx.scene.add(this.root);
    this.counts = { frag: 1, flash: 2 };
    this.cooldown = 0;
    this.pending = null;
    this.projectiles = [];
    this.pickups = [];
    this.prompt = "";
    this.focus = null;
    this.flashAmount = 0;
    this._flashTime = 0;
    this._flashPeak = 0;
    this.materials = [
      new THREE.MeshStandardMaterial({ color: 0x39402b, roughness: 0.64, metalness: 0.35 }),
      new THREE.MeshStandardMaterial({ color: 0x9b9d98, roughness: 0.4, metalness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x222722, roughness: 0.55, metalness: 0.65 }),
    ];
    this.geometries = [];
    this.prototypes = { frag: this._model("frag"), flash: this._model("flash") };
    this._from = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  _model(kind) {
    const root = new THREE.Group();
    const add = (geometry, material, x = 0, y = 0, z = 0) => {
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.materials[material]);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };
    if (kind === "frag") {
      add(new THREE.SphereGeometry(0.047, 16, 12), 0).scale.y = 1.2;
      add(new THREE.CylinderGeometry(0.022, 0.026, 0.025, 12), 2, 0, 0.057);
      add(new THREE.BoxGeometry(0.016, 0.094, 0.009), 1, 0.028, 0.023).rotation.z = 0.33;
    } else {
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.125, 16), 1);
      for (const y of [-0.047, 0.047]) add(new THREE.CylinderGeometry(0.033, 0.033, 0.014, 16), 2, 0, y);
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5;
        add(new THREE.BoxGeometry(0.005, 0.052, 0.003), 2, Math.cos(a) * 0.0305, 0, Math.sin(a) * 0.0305).rotation.y = -a;
      }
      add(new THREE.BoxGeometry(0.015, 0.12, 0.009), 2, 0.028, 0.027).rotation.z = 0.24;
    }
    add(new THREE.TorusGeometry(0.014, 0.002, 6, 14), 1, -0.024, 0.069);
    return root;
  }

  input() {
    const input = this.ctx.input;
    this._focusPickup();
    if (input.actionPressed("use") && this.focus) this.pickup(this.focus);
    if (input.actionPressed("melee")) this.use("melee");
    if (input.actionPressed("grenade")) this.use("frag");
    if (input.actionPressed("tactical")) this.use("flash");
  }

  use(kind) {
    const player = this.ctx.get("player");
    if (!this.match.started || this.match.finished || player.dead || this.cooldown > 0 || this.ctx.input.menuActive) return false;
    if (kind !== "melee" && !(this.counts[kind] > 0)) return false;
    const weapons = this.ctx.get("weapons");
    const duration = weapons.playEquipment(kind);
    if (!duration) return false;
    if (kind !== "melee") this.counts[kind]--;
    this.cooldown = duration;
    this.pending = { kind, delay: kind === "melee" ? 0.24 : 0.36 };
    this.ctx.events.emit("equipment:use", { kind, duration });
    return true;
  }

  fixedUpdate(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.pending) {
      this.pending.delay -= dt;
      if (this.pending.delay <= 0) {
        const kind = this.pending.kind;
        this.pending = null;
        if (!this.ctx.get("player").dead) {
          if (kind === "melee") this.melee();
          else this.throw(kind);
        }
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const g = this.projectiles[i];
      g.fuse -= dt;
      if (g.fuse > 0) continue;
      const position = g.body.position.clone();
      position.y += 0.06;
      if (g.kind === "frag") {
        this.ctx.events.emit("explosion", { position, radius: 7, damage: 260, source: this.ctx.get("player"), weapon: "frag" });
      } else this.flash(position);
      this.physics.removeRigidBody(g.body);
      g.mesh.removeFromParent();
      this.projectiles.splice(i, 1);
    }
    this._flashTime = Math.max(0, this._flashTime - dt);
    this.flashAmount = this._flashPeak * Math.min(1, this._flashTime / 1.5);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      if (p.life <= 0) this._removePickup(p);
    }
  }

  throw(kind) {
    const player = this.ctx.get("player");
    const dir = this._dir.set(0, 0, -1).applyQuaternion(this.ctx.camera.quaternion);
    const from = this._from.copy(this.ctx.camera.position).addScaledVector(dir, 0.35);
    from.y -= 0.12;
    const mesh = this.prototypes[kind].clone(true);
    this.root.add(mesh);
    const velocity = dir.clone().multiplyScalar(16).add(player.velocity);
    velocity.y += 3.2;
    const body = this.physics.addRigidBody({
      shape: "sphere", radius: 0.055, mass: 0.42, position: from,
      velocity, restitution: 0.32, friction: 0.65, lifetime: 8,
      angularVelocity: { x: 9, y: 3, z: 6 }, object3D: mesh, surfaceType: "metal",
    });
    this.projectiles.push({ body, mesh, kind, fuse: kind === "frag" ? 2.5 : 1.45 });
    this.ctx.events.emit("equipment:throw", { kind, position: from.clone() });
  }

  melee() {
    const from = this.ctx.camera.position;
    const dir = this._dir.set(0, 0, -1).applyQuaternion(this.ctx.camera.quaternion);
    let victim = null, nearest = 2.1;
    for (const a of this.ctx.get("ai").agents) {
      if (!a.alive) continue;
      const target = a.position.clone().add(new THREE.Vector3(0, 1.15, 0));
      const delta = target.sub(from), distance = delta.length();
      if (distance >= nearest || delta.normalize().dot(dir) < 0.72) continue;
      if (!this.physics.lineOfSight(from, a.eye, this.physics.MASK.SIGHT)) continue;
      victim = a; nearest = distance;
    }
    if (victim) {
      this.ctx.events.emit("damage:dealt", {
        target: victim, amount: 160, point: victim.eye.clone(), incident: dir.clone(),
        source: this.ctx.get("player"), weapon: "knife", type: "melee", headshot: false,
      });
      this.ctx.events.emit("bullet:impact", { point: victim.eye.clone(), normal: dir.clone().negate(), incident: dir.clone(), surface: "flesh", damage: 80, actor: victim });
      this.ctx.get("player").addRecoil(-0.009, 0.003, -0.01, 0.01);
    }
    this.ctx.events.emit("equipment:melee", { hit: !!victim });
    return !!victim;
  }

  flash(position) {
    const physics = this.physics;
    for (const a of this.ctx.get("ai").agents) {
      if (!a.alive) continue;
      const direction = position.clone().sub(a.eye), distance = direction.length();
      direction.normalize();
      const facing = direction.x * Math.sin(a.yaw) + direction.z * Math.cos(a.yaw);
      const exposure = flashExposure(distance, facing, physics.lineOfSight(position, a.eye, physics.MASK.SIGHT));
      a.blindRemaining = Math.max(a.blindRemaining ?? 0, exposure * 4.5);
      if (exposure) { a.suppress(exposure); a.wantFire = false; }
    }
    const camera = this.ctx.camera;
    const direction = position.clone().sub(camera.position), distance = direction.length();
    const forward = this._dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const exposure = flashExposure(distance, direction.normalize().dot(forward), physics.lineOfSight(position, camera.position, physics.MASK.SIGHT));
    this._flashPeak = Math.max(this.flashAmount, exposure);
    this._flashTime = Math.max(this._flashTime, exposure * 4.5);
    this.flashAmount = this._flashPeak;
    this.ctx.peek("fx")?.lights.flash(position.x, position.y, position.z, 1, 0.98, 0.87, 85, 0.18, 25, 18, 4);
    this.ctx.events.emit("equipment:flash", { position, exposure });
    this.ctx.peek("audio")?.play?.("explosion", { position, gain: 0.2, radius: 1 });
  }

  dropWeapon(actor) {
    const id = actor.variantName === "irregular" ? "ak47" : actor.variantName === "breacher" ? "smg" : "rifle";
    const entry = this.ctx.get("weapons").viewmodel.weapons.get(id);
    if (!entry) return;
    const mesh = entry.group.clone(true);
    mesh.visible = true;
    mesh.position.copy(actor.position);
    mesh.position.y += 0.13;
    mesh.rotation.set(0, actor.yaw, Math.PI / 2);
    this.root.add(mesh);
    this.pickups.push({ id, mesh, life: 24, name: entry.def?.name ?? id });
    while (this.pickups.length > 12) this._removePickup(this.pickups[0]);
  }

  _focusPickup() {
    this.focus = null; this.prompt = "";
    const p = this.ctx.get("player").position;
    let nearest = 1.8;
    for (const pickup of this.pickups) {
      const distance = pickup.mesh.position.distanceTo(p);
      if (distance < nearest && this.physics.lineOfSight(this.ctx.camera.position, pickup.mesh.position, this.physics.MASK.SIGHT)) {
        this.focus = pickup; nearest = distance;
      }
    }
    if (this.focus) this.prompt = `Hold F to pick up ${this.focus.name}`;
  }

  pickup(pickup) {
    if (!this.pickups.includes(pickup) || !this.ctx.get("weapons").pickupWeapon(pickup.id)) return false;
    this._removePickup(pickup);
    this.prompt = ""; this.focus = null;
    this.ctx.events.emit("equipment:pickup", { weapon: pickup.id });
    return true;
  }

  _removePickup(pickup) {
    pickup.mesh.removeFromParent();
    const i = this.pickups.indexOf(pickup);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  respawn() {
    this.counts.frag = 1; this.counts.flash = 2;
    this.cooldown = 0; this.pending = null;
    this._flashTime = this._flashPeak = this.flashAmount = 0;
    this.prompt = ""; this.focus = null;
  }

  clear() {
    for (const g of this.projectiles) { this.physics.removeRigidBody(g.body); g.mesh.removeFromParent(); }
    this.projectiles.length = 0;
    for (const p of [...this.pickups]) this._removePickup(p);
    this.respawn();
  }

  dispose() {
    this.clear(); this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
