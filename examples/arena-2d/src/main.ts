import {
  Camera2D,
  Light,
  LocalTransform,
  SpriteRenderer,
  createBrowserInputPlugin,
  createGame,
  createPhysics2DPlugin,
  createRendererPlugin,
  defineProject,
  defineSystem,
} from "@natural-engine/natural";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error("Game canvas not found");
const renderer = createRendererPlugin({ canvas, antialias: true });
const project = defineProject({
  id: "natural-arena-2d",
  name: "Natural Arena 2D",
  plugins: [
    createBrowserInputPlugin(),
    createPhysics2DPlugin({ gravity: { x: 0, y: 0 } }),
    renderer,
  ],
  input: {
    left: {
      bindings: [
        { type: "key", code: "KeyA" },
        { type: "key", code: "ArrowLeft" },
      ],
    },
    right: {
      bindings: [
        { type: "key", code: "KeyD" },
        { type: "key", code: "ArrowRight" },
      ],
    },
    up: {
      bindings: [
        { type: "key", code: "KeyW" },
        { type: "key", code: "ArrowUp" },
      ],
    },
    down: {
      bindings: [
        { type: "key", code: "KeyS" },
        { type: "key", code: "ArrowDown" },
      ],
    },
  },
});
const game = createGame({ project });
await game.initialize();

const camera = game.world.createEntity();
game.world.add(camera, LocalTransform, { position: { z: 20 } });
game.world.add(camera, Camera2D, { size: 11 });
const light = game.world.createEntity();
game.world.add(light, LocalTransform);
game.world.add(light, Light, { type: "ambient", intensity: 3 });
const player = game.world.createEntity();
game.world.add(player, LocalTransform);
game.world.add(player, SpriteRenderer, { color: "#5cf2b7", size: { x: 1.2, y: 1.2 }, layer: 2 });
for (let index = 0; index < 256; index += 1) {
  const entity = game.world.createEntity();
  game.world.add(entity, LocalTransform, {
    position: { x: (index % 16) - 8, y: Math.floor(index / 16) - 8 },
  });
  game.world.add(entity, SpriteRenderer, {
    color: index % 2 === 0 ? "#4a7db8" : "#705ca8",
    size: { x: 0.6, y: 0.6 },
  });
}
game.scheduler.add(
  defineSystem({
    name: "arena.player-movement",
    stage: "fixedUpdate",
    run: ({ delta }) => {
      const transform = game.world.require(player, LocalTransform);
      transform.position.x += (game.input.value("right") - game.input.value("left")) * 8 * delta;
      transform.position.y += (game.input.value("up") - game.input.value("down")) * 8 * delta;
    },
  }),
);

const resize = (): void => renderer.renderer.resize(canvas.clientWidth, canvas.clientHeight);
window.addEventListener("resize", resize);
resize();
await game.start();
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
document.body.dataset.engineReady = "true";
