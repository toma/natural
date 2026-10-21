import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("custom FPS builds preserve existing files and require an empty output directory", () => {
  const root = resolve(import.meta.dir, "..");
  const output = mkdtempSync(resolve(tmpdir(), "natural-fps-build-test-"));
  const marker = resolve(output, "keep.txt");
  const build = () =>
    Bun.spawnSync(["bun", resolve(root, "build.ts"), `--outdir=${output}`], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
  try {
    writeFileSync(marker, "preserve this file");
    const rejected = build();
    expect(rejected.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(rejected.stderr)).toContain("must be empty");
    expect(readFileSync(marker, "utf8")).toBe("preserve this file");

    rmSync(marker);
    expect(build().exitCode).toBe(0);
    expect(readdirSync(output)).toContain("index.html");
    expect(readFileSync(resolve(output, "LICENSE.upstream"), "utf8")).toBe(
      readFileSync(resolve(root, "LICENSE.upstream"), "utf8"),
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
