import { cp, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

interface Target {
  name: string;
  entrypoint: string;
  outdir: string;
  target: "browser" | "bun";
}

const root = resolve(import.meta.dir, "..");
const libraries = [
  "assets",
  "core",
  "gameplay",
  "netcode",
  "physics",
  "plugin-sdk",
  "render",
  "natural",
  "test",
];
const targets: Target[] = [
  ...libraries.map((name): Target => ({
    name,
    entrypoint: resolve(root, "packages", name, "src", "index.ts"),
    outdir: resolve(root, "packages", name, "dist"),
    target: "browser",
  })),
  {
    name: "cli",
    entrypoint: resolve(root, "packages/cli/src/main.ts"),
    outdir: resolve(root, "packages/cli/dist"),
    target: "bun",
  },
  {
    name: "mcp",
    entrypoint: resolve(root, "packages/mcp/src/main.ts"),
    outdir: resolve(root, "packages/mcp/dist"),
    target: "bun",
  },
];

for (const target of targets) {
  await rm(target.outdir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [target.entrypoint],
    outdir: target.outdir,
    target: target.target,
    format: "esm",
    packages: "external",
    splitting: true,
    sourcemap: "external",
  });
  if (!result.success) throw new AggregateError(result.logs, `Failed to build ${target.name}`);
  console.info(`built ${target.name}`);
}

for (const target of [
  { name: "editor", entrypoint: "packages/editor/src/index.html", outdir: "packages/editor/dist" },
  {
    name: "arena-2d",
    entrypoint: "examples/arena-2d/src/index.html",
    outdir: "examples/arena-2d/dist",
  },
  {
    name: "sandbox-3d",
    entrypoint: "examples/sandbox-3d/src/index.html",
    outdir: "examples/sandbox-3d/dist",
  },
]) {
  await rm(resolve(root, target.outdir), { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [resolve(root, target.entrypoint)],
    outdir: resolve(root, target.outdir),
    target: "browser",
    minify: true,
    sourcemap: "external",
  });
  if (!result.success) throw new AggregateError(result.logs, `Failed to build ${target.name}`);
  console.info(`built ${target.name}`);
}

const declarationRoot = resolve(root, ".natural/types");
await rm(declarationRoot, { recursive: true, force: true });
const typeScript = Bun.which("tsc");
if (typeScript === null)
  throw new Error("TypeScript compiler was not found; run bun install first");
const declarations = Bun.spawn([typeScript, "--project", resolve(root, "tsconfig.build.json")], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await declarations.exited) !== 0) throw new Error("Failed to emit package declarations");

for (const name of libraries) {
  const packageRoot = resolve(root, "packages", name);
  await cp(resolve(declarationRoot, "packages", name, "src"), resolve(packageRoot, "dist"), {
    recursive: true,
  });
  await Promise.all([
    copyFile(resolve(root, "LICENSE"), resolve(packageRoot, "LICENSE")),
    copyFile(resolve(root, "README.md"), resolve(packageRoot, "README.md")),
  ]);
  console.info(`typed ${name}`);
}

await copyFile(resolve(root, "LICENSE"), resolve(root, "packages/cli/LICENSE"));
await copyFile(resolve(root, "README.md"), resolve(root, "packages/cli/README.md"));
await cp(resolve(declarationRoot, "packages/cli/src"), resolve(root, "packages/cli/dist"), {
  recursive: true,
});
await copyFile(resolve(root, "LICENSE"), resolve(root, "packages/mcp/LICENSE"));
await copyFile(resolve(root, "README.md"), resolve(root, "packages/mcp/README.md"));
