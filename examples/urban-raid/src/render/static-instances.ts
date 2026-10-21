import {
  DynamicDrawUsage,
  Frustum,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Object3D,
  type Material,
  type InstancedBufferAttribute,
  type Sphere,
  type Camera,
  type BufferAttribute,
  type InterleavedBufferAttribute,
} from "three";

const opaque = (material: Material) =>
  !material.transparent &&
  (!(material instanceof MeshPhysicalMaterial) || material.transmission === 0);

interface PassInstances {
  mesh: InstancedMesh;
  indices: Int32Array;
  count: number;
}
interface Entry {
  source: InstancedMesh;
  geometry: InstancedMesh["geometry"];
  matrixAttribute: InstancedMesh["instanceMatrix"];
  colorAttribute: InstancedMesh["instanceColor"];
  world: Matrix4;
  matrixVersion: number;
  colorVersion: number | undefined;
  attributes: Array<{
    name: string;
    attribute: BufferAttribute | InterleavedBufferAttribute;
    version: number;
  }>;
  index: InstancedMesh["geometry"]["index"];
  indexVersion: number | undefined;
  spheres: Sphere[];
  passes: Map<string, PassInstances>;
  parent: Object3D | null;
  childIndex: number;
  release: () => void;
}

const attributeVersion = (attribute: BufferAttribute | InterleavedBufferAttribute) =>
  "data" in attribute ? attribute.data.version : attribute.version;

/** Conservative shadow cylinder, including the existing 32 texel filter margin. */
export function intersectsCascade(
  sphere: Sphere,
  center: Sphere["center"],
  axis: Sphere["center"],
  radius: number,
  back: number,
  mapSize: number,
): boolean {
  const x = sphere.center.x - center.x;
  const y = sphere.center.y - center.y;
  const z = sphere.center.z - center.z;
  const t = x * axis.x + y * axis.y + z * axis.z;
  const margin = (32 * (2 * radius)) / mapSize;
  if (t + sphere.radius < -radius - margin || t - sphere.radius > radius + back + margin)
    return false;
  return x * x + y * y + z * z - t * t <= (radius + margin + sphere.radius) ** 2;
}

/** Only immutable world props opt in. Each pass owns its GPU instance attributes. */
export class StaticInstances {
  private readonly entries = new Map<InstancedMesh, Entry>();
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  readonly counts = new Map<string, { total: number; visible: number }>();

  register(source: InstancedMesh): () => void {
    this.entries.get(source)?.release();
    source.updateWorldMatrix(true, false);
    if (source.geometry.boundingSphere === null) source.geometry.computeBoundingSphere();
    const base = source.geometry.boundingSphere;
    if (!base)
      return () => {
        /* No bounds or buffers were registered. */
      };
    const matrix = new Matrix4();
    const spheres: Sphere[] = [];
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, matrix);
      spheres.push(base.clone().applyMatrix4(matrix).applyMatrix4(source.matrixWorld));
    }
    const entry: Entry = {
      source,
      geometry: source.geometry,
      matrixAttribute: source.instanceMatrix,
      colorAttribute: source.instanceColor,
      spheres,
      world: source.matrixWorld.clone(),
      matrixVersion: source.instanceMatrix.version,
      colorVersion: source.instanceColor?.version,
      attributes: Object.entries(source.geometry.attributes).map(([name, attribute]) => ({
        name,
        attribute,
        version: attributeVersion(attribute),
      })),
      index: source.geometry.index,
      indexVersion: source.geometry.index?.version,
      passes: new Map(),
      parent: source.parent,
      childIndex: source.parent?.children.indexOf(source) ?? -1,
      release: () => {
        if (this.entries.get(source) !== entry) return;
        source.removeEventListener("dispose", entry.release);
        for (const pass of entry.passes.values()) {
          pass.mesh.dispose();
          if (pass.mesh.geometry !== entry.geometry) pass.mesh.geometry.dispose();
        }
        entry.passes.clear();
        this.entries.delete(source);
      },
    };
    source.addEventListener("dispose", entry.release);
    this.entries.set(source, entry);
    return entry.release;
  }

  private eligible(entry: Entry): boolean {
    const s = entry.source;
    return (
      (Array.isArray(s.material) ? s.material.every(opaque) : opaque(s.material)) &&
      s.userData.owNoInstanceCull !== true &&
      s.frustumCulled &&
      s.count === entry.spheres.length &&
      s.geometry === entry.geometry &&
      s.geometry.index === entry.index &&
      s.geometry.index?.version === entry.indexVersion &&
      entry.attributes.every(
        ({ name, attribute, version }) =>
          s.geometry.attributes[name] === attribute && attributeVersion(attribute) === version,
      ) &&
      Object.keys(s.geometry.attributes).length === entry.attributes.length &&
      Object.values(s.geometry.morphAttributes).every((attributes) => !attributes?.length) &&
      s.instanceMatrix === entry.matrixAttribute &&
      s.instanceColor === entry.colorAttribute &&
      (s.instanceColor === null || s.instanceColor.meshPerAttribute === 1) &&
      s.matrixWorld.equals(entry.world) &&
      s.instanceMatrix.version === entry.matrixVersion &&
      s.instanceColor?.version === entry.colorVersion &&
      s.morphTexture === null &&
      s.onBeforeRender === Object3D.prototype.onBeforeRender &&
      s.onAfterRender === Object3D.prototype.onAfterRender
    );
  }

  prepareCamera(camera: Camera): void {
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.prepare("camera", (sphere) => this.frustum.intersectsSphere(sphere));
  }

  prepare(name: string, intersects: (sphere: Sphere) => boolean): void {
    let total = 0;
    let visible = 0;
    for (const entry of this.entries.values()) {
      if (!this.eligible(entry)) continue;
      const source = entry.source;
      let pass = entry.passes.get(name);
      if (!pass) {
        // Three caches vertex bindings by geometry/program, while the instance
        // attribute belongs to the mesh. Shared prop prototypes otherwise rebind
        // every vertex attribute for every cloud on every forward draw.
        const geometry = name === "camera" ? source.geometry.clone() : source.geometry;
        const mesh = new InstancedMesh(geometry, source.material, source.count);
        mesh.name = `${source.name}:${name}`;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        if (source.instanceColor) {
          mesh.instanceColor = source.instanceColor.clone() as InstancedBufferAttribute;
          mesh.instanceColor.setUsage(DynamicDrawUsage);
        }
        pass = { mesh, indices: new Int32Array(source.count).fill(-1), count: -1 };
        entry.passes.set(name, pass);
      }
      let count = 0;
      let changed = false;
      for (let i = 0; i < entry.spheres.length; i++) {
        if (!intersects(entry.spheres[i]!)) continue;
        if (pass.indices[count] !== i) {
          changed = true;
          pass.indices[count] = i;
          for (let j = 0; j < 16; j++)
            pass.mesh.instanceMatrix.array[count * 16 + j] =
              source.instanceMatrix.array[i * 16 + j]!;
          if (source.instanceColor && pass.mesh.instanceColor) {
            for (let j = 0; j < 3; j++)
              pass.mesh.instanceColor.array[count * 3 + j] = source.instanceColor.array[i * 3 + j]!;
          }
        }
        count++;
      }
      pass.count = count;
      pass.mesh.count = count;
      if (changed) {
        pass.mesh.instanceMatrix.clearUpdateRanges();
        // A hidden batch may skip several uploads. Include previously changed tails
        // when its next visible draw reaches the GPU, even if this list shrank.
        pass.mesh.instanceMatrix.needsUpdate = true;
        if (pass.mesh.instanceColor) {
          pass.mesh.instanceColor.clearUpdateRanges();
          pass.mesh.instanceColor.needsUpdate = true;
        }
      }
      total += source.count;
      visible += count;
    }
    this.counts.set(name, { total, visible });
  }

  run<T>(name: string, draw: () => T): T {
    const restores: Array<() => void> = [];
    try {
      for (const entry of this.entries.values()) {
        const source = entry.source;
        const pass = entry.passes.get(name);
        const parent = source.parent;
        if (!pass || !parent || !this.eligible(entry)) continue;
        // World props keep their order. Revalidate the cached slot for callers
        // that reparent a source or insert/remove one of its siblings.
        if (entry.parent !== parent || parent.children[entry.childIndex] !== source) {
          entry.parent = parent;
          entry.childIndex = parent.children.indexOf(source);
        }
        const index = entry.childIndex;
        if (index < 0) continue;
        const mesh = pass.mesh;
        mesh.geometry.groups = source.geometry.groups;
        mesh.geometry.drawRange = source.geometry.drawRange;
        mesh.material = source.material;
        mesh.visible = source.visible && mesh.count > 0;
        mesh.layers.mask = source.layers.mask;
        mesh.renderOrder = source.renderOrder;
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = source.receiveShadow;
        mesh.userData = source.userData;
        mesh.matrix.copy(source.matrix);
        mesh.matrixWorld.copy(source.matrixWorld);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.boundingSphere = source.boundingSphere;
        mesh.boundingBox = source.boundingBox;
        mesh.parent = parent;
        parent.children[index] = mesh;
        restores.push(() => {
          parent.children[index] = source;
          mesh.parent = null;
        });
      }
      return draw();
    } finally {
      for (let i = restores.length - 1; i >= 0; i--) restores[i]!();
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.release();
    this.counts.clear();
  }
}
