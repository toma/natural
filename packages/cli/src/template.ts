export const projectPackage = (name: string): string =>
  `${JSON.stringify(
    {
      name,
      version: "0.0.1",
      private: true,
      type: "module",
      scripts: {
        dev: "natural dev",
        build: "natural build",
        desktop: "tauri dev",
        "desktop:build": "natural export --target=desktop",
        server: "bun --hot server.ts",
        test: "bun test",
        typecheck: "tsc --noEmit",
        check: "bun run typecheck && bun test",
      },
      dependencies: { "@toma.com/natural": "^0.1.0-alpha.4" },
      devDependencies: {
        "@toma.com/cli": "^0.1.0-alpha.4",
        "@tauri-apps/cli": "^2.8.5",
        "@types/bun": "^1.3.0",
        typescript: "^5.9.2",
      },
    },
    null,
    2,
  )}\n`;

export const projectConfig = (
  name: string,
): string => `import { defineProject } from "@toma.com/natural";

export default defineProject({
  id: "${name}",
  name: "${name}",
  entryScene: "scenes/main.scene.jsonc",
  input: {
    moveLeft: { bindings: [{ type: "key", code: "KeyA" }] },
    moveRight: { bindings: [{ type: "key", code: "KeyD" }] },
  },
});
`;

export const gameEntry = `import {
  Camera3D,
  Light,
  LocalTransform,
  MeshRenderer,
  createBrowserInputPlugin,
  createGame,
  createRendererPlugin,
  defineProject,
  defineSystem,
} from "@toma.com/natural";
import project from "../natural.config.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error("Game canvas was not found");
const renderer = createRendererPlugin({ canvas, clearColor: "#08131f" });
const runtimeProject = defineProject({ ...project, plugins: [createBrowserInputPlugin(), renderer] });
const game = createGame({ project: runtimeProject });
await game.initialize();

const camera = game.world.createEntity();
game.world.add(camera, LocalTransform, { position: { x: 0, y: 2, z: 6 } });
game.world.add(camera, Camera3D);
const light = game.world.createEntity();
game.world.add(light, LocalTransform, { position: { x: 4, y: 6, z: 3 } });
game.world.add(light, Light, { type: "directional", intensity: 4 });
const ambient = game.world.createEntity();
game.world.add(ambient, LocalTransform);
game.world.add(ambient, Light, { type: "ambient", intensity: 1.5 });
const cube = game.world.createEntity();
game.world.add(cube, LocalTransform);
game.world.add(cube, MeshRenderer, { color: "#34d399" });
game.scheduler.add(defineSystem({
  name: "game.rotate-cube",
  stage: "update",
  run: ({ elapsed }) => {
    const transform = game.world.require(cube, LocalTransform);
    transform.rotation = { x: 0, y: Math.sin(elapsed / 2), z: 0, w: Math.cos(elapsed / 2) };
  },
}));
const resize = (): void => renderer.renderer.resize(canvas.clientWidth, canvas.clientHeight);
window.addEventListener("resize", resize);
resize();
await game.start();
document.body.dataset.ready = "true";
console.info(\`Natural started: \${project.name}\`);
`;

export const sceneTemplate = (name: string): string => `{
  // Natural scene files are canonical JSONC with stable UUIDs.
  "version": 1,
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "${name}",
  "root": {
    "id": "00000000-0000-4000-8000-000000000002",
    "name": "Root",
    "children": []
  }
}
`;

export const gameHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Natural Game</title>
    <style>html,body,#game{width:100%;height:100%;margin:0;display:block;overflow:hidden;background:#08131f}</style>
  </head>
  <body><canvas id="game" aria-label="Natural game viewport"></canvas><script type="module" src="./main.ts"></script></body>
</html>
`;

export const serverEntry = `import { createServer, defineBinarySchema } from "@toma.com/natural";

const state = defineBinarySchema<{ x: number; y: number }>([
  { name: "x", type: "f32" },
  { name: "y", type: "f32" },
]);
const server = createServer({
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? "127.0.0.1",
  authenticate: (credential) => {
    const token = process.env.NATURAL_AUTH_TOKEN;
    return token === undefined || credential === token;
  },
  createClient: () => ({ x: 0, y: 0 }),
  onInput: (session, payload) => Object.assign(session.data, state.decode(payload)),
  onTick: () => undefined,
  createSnapshot: (session) => state.encode(session.data),
}).start();
console.info(\`Natural authoritative server listening on :\${server.port}\`);
`;

export const projectTest = `import { expect, test } from "bun:test";
import { LocalTransform, World } from "@toma.com/natural";

test("game world boots", () => {
  const world = new World();
  world.register(LocalTransform);
  const entity = world.createEntity();
  world.add(entity, LocalTransform);
  expect(world.has(entity, LocalTransform)).toBe(true);
});
`;

export const projectTsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      allowImportingTsExtensions: true,
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      module: "Preserve",
      moduleResolution: "Bundler",
      noEmit: true,
      strict: true,
      target: "ES2023",
      types: ["bun"],
    },
    include: ["src/**/*.ts", "tests/**/*.ts", "*.ts"],
  },
  null,
  2,
)}\n`;

export const projectGitignore = `node_modules/
dist/
src-tauri/target/
.natural/
*.log
`;

export const projectAgents = `# Natural project guide

- Run \`bun run check\` before shipping changes.
- Keep fixed-tick gameplay deterministic; use seeded randomness.
- Use stable IDs in scene files and avoid editing generated \`.natural/\` cache data.
- Prefer the Natural CLI for builds, exports, inspection, and diagnostics.
- Prefix PR titles with \`Hotfix\` or a Linear ticket such as \`[ENG-123]\`.
`;

export const projectReadme = (name: string): string => `# ${name}

A 2D/3D game built with Natural. Run \`bun install\`, then \`bun run dev\`.

- \`bun run check\`: type-check and test
- \`bun run server\`: authoritative Bun server
- \`bun run desktop\`: desktop development shell
- \`bun run desktop:build\`: native desktop package
`;

export const desktopCargo = (name: string): string => `[package]
name = "${name}"
version = "0.0.1"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
`;

export const desktopBuild = `fn main() {
    tauri_build::build()
}
`;

export const desktopMain = `fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Natural game failed to start");
}
`;

export const desktopConfig = (name: string): string =>
  `${JSON.stringify(
    {
      $schema: "https://schema.tauri.app/config/2",
      productName: name,
      version: "0.0.1",
      identifier: `dev.naturalgame.${name.replaceAll("-", ".")}`,
      build: {
        beforeDevCommand: "bun run dev",
        beforeBuildCommand: "bun run build",
        devUrl: "http://localhost:3000",
        frontendDist: "../dist",
      },
      app: {
        windows: [{ title: name, width: 1280, height: 720, minWidth: 640, minHeight: 360 }],
        security: {
          csp: "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:3000 ws://127.0.0.1:3000; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'",
        },
      },
      bundle: {
        active: true,
        targets: "all",
        icon: ["icons/icon.png", "icons/icon.icns", "icons/icon.ico"],
        macOS: { signingIdentity: "-" },
      },
    },
    null,
    2,
  )}\n`;
