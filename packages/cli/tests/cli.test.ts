import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProject, createProject, doctor, inspectScene, runCommand } from "../src/index.ts";

test("creates and inspects a complete starter project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "natural-cli-"));
  const result = await createProject({ cwd, json: true }, "my-game");
  expect(result.ok).toBe(true);
  const inspected = await inspectScene(
    { cwd: join(cwd, "my-game"), json: true },
    "scenes/main.scene.jsonc",
  );
  expect((inspected.data as { version: number }).version).toBe(1);
  expect(await Bun.file(join(cwd, "my-game", "src-tauri", "tauri.conf.json")).exists()).toBe(true);
  expect(await Bun.file(join(cwd, "my-game", "src-tauri", "icons", "icon.png")).exists()).toBe(
    true,
  );
  expect(await Bun.file(join(cwd, "my-game", "server.ts")).exists()).toBe(true);
  expect(await Bun.file(join(cwd, "my-game", "tests", "game.test.ts")).exists()).toBe(true);
});

test("doctor and help return machine-readable results", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "natural-doctor-"));
  expect((await doctor({ cwd, json: true })).ok).toBe(false);
  await writeFile(join(cwd, "package.json"), "{}\n");
  expect((await doctor({ cwd, json: true })).ok).toBe(true);
  expect((await runCommand([], { cwd, json: true })).command).toBe("help");
  expect(() => createProject({ cwd, json: true }, "Not Valid")).toThrow("kebab-case");
  expect(inspectScene({ cwd, json: true }, "../escape.scene.jsonc")).rejects.toThrow("escapes");
  await writeFile(join(cwd, "bad.scene.jsonc"), "{}\n");
  expect(inspectScene({ cwd, json: true }, "bad.scene.jsonc")).rejects.toThrow("Scene version");
  expect(runCommand(["export", "--target=console"], { cwd, json: true })).rejects.toThrow(
    "Unknown export target",
  );
});

test("builds a browser project into dist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "natural-build-"));
  await mkdir(join(cwd, "src"));
  await writeFile(
    join(cwd, "src", "index.html"),
    "<!doctype html><title>Game</title><script src='./main.ts'></script>",
  );
  await writeFile(join(cwd, "src", "main.ts"), "document.body.dataset.ready = 'true';\n");
  await mkdir(join(cwd, "dist"));
  await writeFile(join(cwd, "dist", "stale.js"), "stale\n");
  const result = await buildProject({ cwd, json: true }, false);
  expect(result.ok).toBe(true);
  expect(await Bun.file(join(cwd, "dist", "index.html")).exists()).toBe(true);
  expect(await Bun.file(join(cwd, "dist", "stale.js")).exists()).toBe(false);
});
