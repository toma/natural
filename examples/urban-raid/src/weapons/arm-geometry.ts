import { BufferGeometry, Float32BufferAttribute } from "three";

// Elbow, muscle belly, tendon transition, and wrist. Radii are metres.
const profile = [
  [0, 0.037, 0.032],
  [0.12, 0.043, 0.037],
  [0.28, 0.048, 0.039],
  [0.45, 0.043, 0.033],
  [0.65, 0.034, 0.027],
  [0.84, 0.028, 0.022],
  [1, 0.025, 0.02],
] as const;

export function forearmSection(t: number): { x: number; y: number } {
  const at = Math.min(1, Math.max(0, t));
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!;
    const b = profile[i]!;
    if (at > b[0]) continue;
    const f = (at - a[0]) / (b[0] - a[0]);
    const before = profile[Math.max(0, i - 2)]!;
    const after = profile[Math.min(profile.length - 1, i + 1)]!;
    const radius = (axis: 1 | 2) => {
      const span = b[0] - a[0];
      const m0 = (b[axis] - before[axis]) / (b[0] - before[0]);
      const m1 = (after[axis] - a[axis]) / (after[0] - a[0]);
      return (
        (2 * f ** 3 - 3 * f ** 2 + 1) * a[axis] +
        (f ** 3 - 2 * f ** 2 + f) * span * m0 +
        (-2 * f ** 3 + 3 * f ** 2) * b[axis] +
        (f ** 3 - f ** 2) * span * m1
      );
    };
    return { x: radius(1), y: radius(2) };
  }
  return { x: 0.025, y: 0.02 };
}

/** Closed, asymmetric forearm along local -Z, with a rounded muscle belly. */
export function createForearmGeometry(length: number, scale = 1): BufferGeometry {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(scale) || scale <= 0)
    throw new Error("Forearm dimensions must be finite and positive");
  const rings = 48;
  const sides = 48;
  const stride = sides + 1;
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const radius = forearmSection(t);
    const belly = Math.exp(-Math.pow((t - 0.3) / 0.27, 2));
    const tendons = Math.exp(-Math.pow((t - 0.82) / 0.15, 2));
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const lobe = 1 + 0.07 * belly * Math.cos(angle - 0.6);
      const tendon = 0.0007 * tendons * Math.pow(Math.max(0, Math.sin(angle * 3 + 0.4)), 8);
      positions.push(
        (Math.cos(angle) * (radius.x * lobe + tendon) + 0.004 * Math.sin(t * Math.PI)) * scale,
        (Math.sin(angle) * (radius.y * lobe + tendon) - 0.003 * Math.sin(t * Math.PI)) * scale,
        -length * t,
      );
      uv.push(i / sides, t);
      if (j < rings && i < sides) {
        const a = j * stride + i;
        indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }
  }
  for (const [ring, z, reverse] of [
    [0, 0, false],
    [rings, -length, true],
  ] as const) {
    const center = positions.length / 3;
    positions.push(0, 0, z);
    uv.push(0.5, ring / rings);
    for (let i = 0; i < sides; i++) {
      const a = ring * stride + i;
      indices.push(center, reverse ? a + 1 : a, reverse ? a : a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let j = 0; j <= rings; j++) {
    const a = j * stride;
    const b = a + sides;
    const x = normals.getX(a) + normals.getX(b);
    const y = normals.getY(a) + normals.getY(b);
    const z = normals.getZ(a) + normals.getZ(b);
    const n = Math.hypot(x, y, z);
    normals.setXYZ(a, x / n, y / n, z / n);
    normals.setXYZ(b, x / n, y / n, z / n);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
