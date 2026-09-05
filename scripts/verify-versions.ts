import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packageNames = [
  "assets",
  "cli",
  "core",
  "gameplay",
  "mcp",
  "natural",
  "netcode",
  "physics",
  "plugin-sdk",
  "render",
  "test",
] as const;

async function json(path: string): Promise<{ version?: string }> {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as { version?: string };
}

const expected = (await json("package.json")).version;
if (expected === undefined) throw new Error("Root package version is missing");
const versions = new Map<string, string | undefined>();
for (const name of packageNames)
  versions.set(`packages/${name}`, (await json(`packages/${name}/package.json`)).version);
versions.set(
  "desktop config",
  (await json("apps/editor-desktop/src-tauri/tauri.conf.json")).version,
);

const cargo = await readFile(resolve(root, "apps/editor-desktop/src-tauri/Cargo.toml"), "utf8");
versions.set("desktop crate", /^version = "([^"]+)"/m.exec(cargo)?.[1]);
for (const [name, version] of versions) {
  if (version !== expected) throw new Error(`${name} version ${String(version)} != ${expected}`);
}

const tag = process.env.GITHUB_REF_NAME;
if (tag !== undefined && tag !== `v${expected}`)
  throw new Error(`Release tag ${tag} does not match v${expected}`);

console.info(`all release versions match ${expected}`);
