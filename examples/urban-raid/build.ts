import { copyFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const root = import.meta.dir;
const { values } = parseArgs({ options: { outdir: { type: "string", default: "dist" } } });
const outdir = resolve(root, values.outdir);
if (outdir === resolve(root, "dist")) {
  await rm(outdir, { recursive: true, force: true });
} else if (existsSync(outdir) && (await readdir(outdir)).length > 0) {
  throw new Error("A custom build output directory must be empty");
}
const result = await Bun.build({
  entrypoints: [resolve(root, "src/index.html")],
  outdir,
  target: "browser",
  minify: true,
  sourcemap: "external",
});
if (!result.success) throw new AggregateError(result.logs, "Failed to build NaturalFPS");
await copyFile(resolve(root, "LICENSE.upstream"), resolve(outdir, "LICENSE.upstream"));
console.info("Built NaturalFPS with upstream license notice");
