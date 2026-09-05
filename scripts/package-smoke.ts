import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const outputRoot = resolve(root, ".natural/package-smoke");
const archiveRoot = resolve(outputRoot, "archives");
const installRoot = resolve(outputRoot, "consumer");
const packages = [
  "assets",
  "core",
  "gameplay",
  "netcode",
  "physics",
  "plugin-sdk",
  "render",
  "natural",
  "test",
  "cli",
  "mcp",
] as const;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(archiveRoot, { recursive: true });

const archives = new Map<string, string>();
for (const name of packages) {
  const packageRoot = resolve(root, "packages", name);
  const pack = Bun.spawn(["bun", "pm", "pack", "--destination", archiveRoot, "--quiet"], {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = (await new Response(pack.stdout).text()).trim();
  if ((await pack.exited) !== 0) throw new Error(`Failed to pack ${name}`);
  const archive = output.split("\n").at(-1);
  if (archive === undefined || archive === "")
    throw new Error(`Pack did not report ${name} archive`);
  archives.set(name, archive);

  const manifestProcess = Bun.spawn(["tar", "-xOf", archive, "package/package.json"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const manifestText = await new Response(manifestProcess.stdout).text();
  if ((await manifestProcess.exited) !== 0) throw new Error(`Cannot inspect ${name} archive`);
  if (manifestText.includes("workspace:"))
    throw new Error(`${name} package contains unresolved workspace dependencies`);
  const manifest = JSON.parse(manifestText) as { name?: string; version?: string };
  if (manifest.name === undefined || manifest.version === undefined)
    throw new Error(`${name} package metadata is incomplete`);
}

await mkdir(installRoot, { recursive: true });
const dependencyEntries = await Promise.all(
  packages.map(async (name) => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages", name, "package.json"), "utf8"),
    ) as { name: string };
    return [manifest.name, `file:${archives.get(name)!}`] as const;
  }),
);
await Bun.write(
  resolve(installRoot, "package.json"),
  `${JSON.stringify(
    {
      name: "natural-package-smoke",
      private: true,
      type: "module",
      dependencies: Object.fromEntries(dependencyEntries),
      overrides: Object.fromEntries(dependencyEntries),
    },
    null,
    2,
  )}\n`,
);
await Bun.write(
  resolve(installRoot, "smoke.mjs"),
  `import { LocalTransform, World } from "@natural-engine/natural";
const world = new World();
world.register(LocalTransform);
const entity = world.createEntity();
world.add(entity, LocalTransform, { position: { x: 4, y: 2, z: 1 } });
if (world.require(entity, LocalTransform).position.x !== 4) throw new Error("runtime smoke failed");
console.log("natural package smoke passed");
`,
);

async function run(command: string[], label: string, relativeCwd = "."): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: resolve(installRoot, relativeCwd),
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`${label} failed`);
}

await run(["bun", "install"], "clean-room install");
await run(["bun", "smoke.mjs"], "Bun package import");
await run(["node", "smoke.mjs"], "Node ESM package import");
const naturalCli = resolve(installRoot, "node_modules/.bin/natural");
await run([naturalCli, "help", "--json"], "CLI package");
await run([naturalCli, "create", "generated-game", "--json"], "packaged project creation");
await run([naturalCli, "build", "--json"], "generated project build", "generated-game");
await run([naturalCli, "test", "--json"], "generated project test", "generated-game");

console.info(`validated ${packages.length} publishable packages`);
