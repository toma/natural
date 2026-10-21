import { expect, test } from "bun:test";
import {
  Bone,
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
} from "three";
import { canCollapseDepthGroups, DepthDraws } from "../src/render/depth-draws.ts";
import { FrameTransforms } from "../src/render/frame-transforms.ts";
import { intersectsCascade, StaticInstances } from "../src/render/static-instances.ts";

function grouped() {
  return new Mesh(
    new BoxGeometry(),
    Array.from({ length: 6 }, () => new MeshBasicMaterial()),
  );
}

test("depth collapse respects partial draw ranges, hidden groups and callback boundaries", () => {
  const mesh = grouped();
  expect(canCollapseDepthGroups(mesh)).toBe(true);
  mesh.geometry.setDrawRange(6, 18);
  expect(canCollapseDepthGroups(mesh)).toBe(true);
  mesh.material[2]!.visible = false;
  expect(canCollapseDepthGroups(mesh)).toBe(false);
  mesh.material[2]!.visible = true;
  mesh.geometry.setDrawRange(7, 18);
  expect(canCollapseDepthGroups(mesh)).toBe(false);
  mesh.geometry.setDrawRange(0, Infinity);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Test exact callback identity.
  const before = mesh.onBeforeRender;
  mesh.onBeforeRender = () => {
    /* Custom group callback. */
  };
  expect(canCollapseDepthGroups(mesh)).toBe(false);
  mesh.onBeforeRender = before;
  mesh.onAfterRender = () => {
    /* Custom group callback. */
  };
  expect(canCollapseDepthGroups(mesh)).toBe(false);
});

test("incomplete, overlapping, reordered and empty depth groups retain separate submissions", () => {
  for (const mutate of [
    (m: ReturnType<typeof grouped>) => {
      m.geometry.groups.pop();
    },
    (m: ReturnType<typeof grouped>) => {
      m.geometry.groups[1]!.start = 3;
    },
    (m: ReturnType<typeof grouped>) => {
      m.geometry.groups.reverse();
    },
    (m: ReturnType<typeof grouped>) => {
      m.geometry.clearGroups();
    },
    (m: ReturnType<typeof grouped>) => {
      m.geometry.groups[1]!.materialIndex = 9;
    },
  ]) {
    const mesh = grouped();
    mutate(mesh);
    expect(canCollapseDepthGroups(mesh)).toBe(false);
  }
});

test("depth materials are restored after exceptions without changing geometry or draw ranges", () => {
  const mesh = grouped(),
    helper = new DepthDraws();
  const material = mesh.material,
    groups = mesh.geometry.groups;
  mesh.geometry.setDrawRange(6, 18);
  helper.prepare([mesh]);
  expect(() =>
    helper.run(() => {
      expect((mesh as Mesh).material).toBe(material[0]!);
      expect(mesh.geometry.groups).toBe(groups);
      throw new Error("draw failed");
    }),
  ).toThrow("draw failed");
  expect(mesh.material).toBe(material);
  expect(mesh.geometry.drawRange).toEqual({ start: 6, count: 18 });
  helper.dispose();
  helper.run(() => expect(mesh.material).toBe(material));
});

function props() {
  const scene = new Scene();
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 3);
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -5));
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(20, 0, -5));
  mesh.setMatrixAt(2, new Matrix4().makeTranslation(0, 0, 5));
  mesh.setColorAt(0, new Color(1, 0, 0));
  mesh.setColorAt(1, new Color(0, 1, 0));
  mesh.setColorAt(2, new Color(0, 0, 1));
  mesh.computeBoundingSphere();
  scene.add(mesh);
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld();
  const helper = new StaticInstances();
  helper.register(mesh);
  return { helper, scene, mesh, camera };
}

test("camera and shadow passes compact matrices and colors independently in canonical order", () => {
  const { helper, scene, mesh, camera } = props();
  const canonical = mesh.instanceMatrix.array.slice();
  helper.prepareCamera(camera);
  helper.prepare("shadow0", (sphere) => sphere.center.x === 20 || sphere.center.z > 0);
  let cameraMesh: InstancedMesh | undefined;
  helper.run("camera", () => {
    cameraMesh = scene.children[0] as InstancedMesh;
    expect(cameraMesh.count).toBe(1);
    expect(Array.from(cameraMesh.instanceColor!.array.slice(0, 3))).toEqual([1, 0, 0]);
  });
  helper.run("shadow0", () => {
    const shadow = scene.children[0] as InstancedMesh;
    expect(shadow).not.toBe(cameraMesh!);
    expect(shadow.count).toBe(2);
    expect(shadow.instanceMatrix.array[12]).toBe(20);
    expect(shadow.instanceMatrix.array[16 + 14]).toBe(5);
    expect(Array.from(shadow.instanceColor!.array.slice(0, 6))).toEqual([0, 1, 0, 0, 0, 1]);
  });
  helper.run("camera", () => expect(scene.children[0]).toBe(cameraMesh!));
  expect(scene.children[0]).toBe(mesh);
  expect(mesh.count).toBe(3);
  expect(mesh.instanceMatrix.array).toEqual(canonical);
  const version = cameraMesh!.instanceMatrix.version;
  helper.prepareCamera(camera);
  expect(cameraMesh!.instanceMatrix.version).toBe(version);
  helper.dispose();
});

test("visibility boundaries include intersecting spheres, offscreen casters and shadow margins", () => {
  const origin = new Vector3(),
    axis = new Vector3(0, 1, 0);
  const sphere = new Sphere(new Vector3(10 + 0.3125 + 1, 0, 0), 1);
  expect(intersectsCascade(sphere, origin, axis, 10, 20, 2048)).toBe(true);
  sphere.center.x += 0.001;
  expect(intersectsCascade(sphere, origin, axis, 10, 20, 2048)).toBe(false);
  sphere.center.set(0, 25, 0);
  expect(intersectsCascade(sphere, origin, axis, 10, 20, 2048)).toBe(true);
  sphere.center.y = 32;
  expect(intersectsCascade(sphere, origin, axis, 10, 20, 2048)).toBe(false);
  sphere.center.y = -12;
  expect(intersectsCascade(sphere, origin, axis, 10, 20, 2048)).toBe(false);
  const { helper, scene, mesh, camera } = props();
  camera.position.x = 5 / Math.sqrt(3) + Math.sqrt(3) / 2;
  camera.updateMatrixWorld();
  helper.prepareCamera(camera);
  helper.run("camera", () => expect((scene.children[0] as InstancedMesh).count).toBeGreaterThan(0));
  mesh.scale.set(2, 3, 4);
  mesh.updateMatrixWorld();
  helper.register(mesh);
  helper.prepare("all", () => true);
  helper.run("all", () =>
    expect((scene.children[0] as InstancedMesh).matrixWorld).toEqual(mesh.matrixWorld),
  );
  helper.dispose();
});

test("camera bindings own immutable vertex buffers and release them without disposing prototypes", () => {
  const { helper, scene, mesh, camera } = props();
  helper.prepareCamera(camera);
  helper.prepare("shadow0", () => true);
  let vertexBuffersDisposed = 0,
    sourceDisposed = 0;
  mesh.geometry.addEventListener("dispose", () => sourceDisposed++);
  helper.run("camera", () => {
    const proxy = scene.children[0] as InstancedMesh;
    expect(proxy.geometry).not.toBe(mesh.geometry);
    expect(proxy.geometry.getAttribute("position").array).not.toBe(
      mesh.geometry.getAttribute("position").array,
    );
    expect(proxy.geometry.getAttribute("position").array).toEqual(
      mesh.geometry.getAttribute("position").array,
    );
    proxy.geometry.addEventListener("dispose", () => vertexBuffersDisposed++);
  });
  helper.run("shadow0", () =>
    expect((scene.children[0] as InstancedMesh).geometry).toBe(mesh.geometry),
  );
  mesh.geometry.setDrawRange(3, 6);
  helper.run("camera", () =>
    expect((scene.children[0] as InstancedMesh).geometry.drawRange).toEqual({ start: 3, count: 6 }),
  );
  mesh.geometry.getAttribute("position").needsUpdate = true;
  helper.run("camera", () => expect(scene.children[0]).toBe(mesh));
  helper.dispose();
  helper.dispose();
  expect(vertexBuffersDisposed).toBe(1);
  expect(sourceDisposed).toBe(0);
});

test("a skipped upload followed by a shorter list preserves the dirty matrix and color tails", () => {
  const { helper, scene, mesh } = props();
  helper.prepare("camera", () => true);
  let proxy: InstancedMesh | undefined;
  helper.run("camera", () => {
    proxy = scene.children[0] as InstancedMesh;
  });
  const gpuMatrices = proxy!.instanceMatrix.array.slice();
  const gpuColors = proxy!.instanceColor!.array.slice();
  mesh.visible = false;
  helper.prepare("camera", (s) => s.center.x === 20 || s.center.z > 0);
  mesh.visible = true;
  helper.prepare("camera", (s) => s.center.x === 0 && s.center.z < 0);
  // Model WebGLAttributes uploading either the requested ranges or the full attribute.
  for (const [attribute, gpu] of [
    [proxy!.instanceMatrix, gpuMatrices],
    [proxy!.instanceColor!, gpuColors],
  ] as const) {
    const ranges = attribute.updateRanges.length
      ? attribute.updateRanges
      : [{ start: 0, count: attribute.array.length }];
    for (const { start, count } of ranges)
      gpu.set(attribute.array.subarray(start, start + count), start);
  }
  helper.prepare("camera", (s) => s.center.x === 0);
  expect(gpuMatrices[16 + 14]).toBe(5);
  expect(Array.from(gpuColors.slice(3, 6))).toEqual([0, 0, 1]);
  helper.dispose();
});

test("instance opt-outs, mutations, hidden props, exception recovery and disposal", () => {
  const { helper, scene, mesh, camera } = props();
  helper.prepareCamera(camera);
  const sibling = new Object3D();
  scene.add(sibling);
  scene.children.reverse();
  helper.run("camera", () => {
    expect(scene.children[0]).toBe(sibling);
    expect(scene.children[1]).not.toBe(mesh);
  });
  expect(scene.children[1]).toBe(mesh);
  scene.remove(sibling);
  let disposed = 0,
    geometryDisposed = 0;
  mesh.geometry.addEventListener("dispose", () => geometryDisposed++);
  helper.run("camera", () =>
    (scene.children[0] as InstancedMesh).addEventListener("dispose", () => disposed++),
  );
  expect(() =>
    helper.run("camera", () => {
      throw new Error("failed");
    }),
  ).toThrow("failed");
  expect(scene.children[0]).toBe(mesh);
  mesh.visible = false;
  helper.run("camera", () => expect(scene.children[0]!.visible).toBe(false));
  mesh.visible = true;
  mesh.frustumCulled = false;
  helper.run("camera", () => expect(scene.children[0]).toBe(mesh));
  mesh.frustumCulled = true;
  mesh.userData.owNoInstanceCull = true;
  helper.run("camera", () => expect(scene.children[0]).toBe(mesh));
  mesh.userData.owNoInstanceCull = false;
  (mesh.material as MeshBasicMaterial).transparent = true;
  helper.run("camera", () => expect(scene.children[0]).toBe(mesh));
  (mesh.material as MeshBasicMaterial).transparent = false;
  mesh.instanceMatrix.needsUpdate = true;
  helper.run("camera", () => expect(scene.children[0]).toBe(mesh));
  mesh.dispose();
  expect(disposed).toBe(1);
  expect(geometryDisposed).toBe(0);
  helper.dispose();
  expect(disposed).toBe(1);
});

test("animated skeleton palettes and world transforms prepare once and recover on errors", () => {
  const scene = new Scene(),
    bone = new Bone();
  const mesh = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  scene.add(mesh);
  const sibling = new SkinnedMesh(mesh.geometry, mesh.material);
  sibling.bind(mesh.skeleton);
  scene.add(sibling);
  const helper = new FrameTransforms();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke with call and verify restoration.
  const original = mesh.skeleton.update;
  let updates = 0;
  mesh.skeleton.update = function () {
    updates++;
    original.call(this);
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Test exact callback identity.
  const update = mesh.skeleton.update;
  bone.position.y = 2;
  expect(() =>
    helper.run([scene], () => {
      expect(scene.matrixWorldAutoUpdate).toBe(false);
      expect(mesh.skeleton.boneMatrices[13]).toBe(2);
      for (let i = 0; i < 6; i++) mesh.skeleton.update();
      expect(updates).toBe(1);
      throw new Error("render failed");
    }),
  ).toThrow("render failed");
  expect(scene.matrixWorldAutoUpdate).toBe(true);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Compare without invoking.
  expect(mesh.skeleton.update).toBe(update);
  bone.position.y = 4;
  helper.run([scene], () => expect(mesh.skeleton.boneMatrices[13]).toBe(4));
  expect(updates).toBe(2);
  mesh.skeleton.update();
  expect(updates).toBe(3);
});
