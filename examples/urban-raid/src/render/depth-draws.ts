import { Mesh, Object3D, type Material } from "three";

/** Collapse only a complete, ordered partition of the effective draw range. */
export function canCollapseDepthGroups(mesh: Mesh): boolean {
  const materials = mesh.material;
  if (!Array.isArray(materials) || !materials[0]?.visible) return false;
  if (
    mesh.onBeforeRender !== Object3D.prototype.onBeforeRender ||
    mesh.onAfterRender !== Object3D.prototype.onAfterRender ||
    mesh.userData.owKeepDepthGroups === true
  )
    return false;
  const geometry = mesh.geometry;
  const size = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(size, start + geometry.drawRange.count);
  if (end <= start || start % 3 !== 0 || end % 3 !== 0) return false;
  let cursor = start;
  for (const group of geometry.groups) {
    const lo = Math.max(start, group.start);
    const hi = Math.min(end, group.start + group.count);
    if (hi <= lo) continue;
    if (lo !== cursor || hi % 3 !== 0 || !materials[group.materialIndex ?? 0]?.visible)
      return false;
    cursor = hi;
  }
  return cursor === end;
}

/** The caller owns the override material. References always return to their owner. */
export class DepthDraws {
  private readonly meshes: Mesh[] = [];
  private readonly materials: Material[][] = [];

  prepare(objects: Object3D[], count = objects.length): void {
    this.meshes.length = 0;
    this.materials.length = 0;
    for (let i = 0; i < count; i++) {
      const object = objects[i];
      if (object instanceof Mesh && canCollapseDepthGroups(object as Mesh)) {
        this.meshes.push(object as Mesh);
        this.materials.push(object.material as Material[]);
      }
    }
  }

  run<T>(draw: () => T): T {
    try {
      for (let i = 0; i < this.meshes.length; i++)
        this.meshes[i]!.material = this.materials[i]![0]!;
      return draw();
    } finally {
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i]!.material = this.materials[i]!;
    }
  }

  dispose(): void {
    this.meshes.length = this.materials.length = 0;
  }
}
