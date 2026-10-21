import {
  Camera3D,
  InstancedMesh,
  Light,
  LocalTransform,
  MeshRenderer,
  createBrowserInputPlugin,
  createGame,
  createRendererPlugin,
  defineProject,
  defineSystem,
} from "@toma.com/natural";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const stats = document.querySelector<HTMLElement>("#stats");
if (canvas === null || stats === null) throw new Error("Sandbox UI was not found");
const renderer = createRendererPlugin({ canvas, clearColor: "#111827" });
const project = defineProject({
  id: "natural-sandbox-3d",
  name: "Natural Sandbox 3D",
  plugins: [createBrowserInputPlugin(), renderer],
  input: {
    left: { bindings: [{ type: "key", code: "KeyA" }] },
    right: { bindings: [{ type: "key", code: "KeyD" }] },
    forward: { bindings: [{ type: "key", code: "KeyW" }] },
    backward: { bindings: [{ type: "key", code: "KeyS" }] },
  },
});
const game = createGame({ project });
await game.initialize();

const camera = game.world.createEntity();
game.world.add(camera, LocalTransform, {
  position: { x: 0, y: 18, z: 30 },
  rotation: { x: -0.25, y: 0, z: 0, w: 0.968 },
});
game.world.add(camera, Camera3D, { far: 20_000 });
const sun = game.world.createEntity();
game.world.add(sun, LocalTransform, { position: { x: 10, y: 30, z: 20 }, rotation: { x: -0.35 } });
game.world.add(sun, Light, { type: "directional", intensity: 4 });
const ambient = game.world.createEntity();
game.world.add(ambient, LocalTransform);
game.world.add(ambient, Light, { type: "ambient", intensity: 1.25 });
const ground = game.world.createEntity();
game.world.add(ground, LocalTransform, { position: { y: -1 }, scale: { x: 100, y: 0.5, z: 100 } });
game.world.add(ground, MeshRenderer, { color: "#203d36" });

const world = game.world.createEntity();
const stress = new URL(location.href).searchParams.get("stress") === "1";
const count = stress ? 1_000_000 : 100_000;
game.world.add(world, LocalTransform, { position: { x: -160, y: 0, z: -160 } });
game.world.add(world, InstancedMesh, {
  primitive: "box",
  color: "#527aa8",
  count,
  spacing: { x: 1.15, y: 0, z: 1.15 },
});
game.scheduler.add(
  defineSystem({
    name: "sandbox.camera-movement",
    stage: "update",
    run: ({ delta }) => {
      const transform = game.world.require(camera, LocalTransform);
      transform.position.x += (game.input.value("right") - game.input.value("left")) * delta * 20;
      transform.position.z +=
        (game.input.value("backward") - game.input.value("forward")) * delta * 20;
    },
  }),
  defineSystem({
    name: "sandbox.stats",
    stage: "render",
    after: ["natural.renderer.sync"],
    run: () => {
      const current = renderer.renderer.stats();
      stats.textContent = `${count.toLocaleString()} instances · ${current.drawCalls} draw calls · ${current.triangles.toLocaleString()} triangles`;
    },
  }),
);
const resize = (): void => renderer.renderer.resize(canvas.clientWidth, canvas.clientHeight);
window.addEventListener("resize", resize);
resize();
await game.start();
