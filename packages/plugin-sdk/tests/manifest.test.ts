import { expect, test } from "bun:test";
import { definePluginManifest } from "../src/index.ts";

test("plugin manifests validate and freeze their security boundary", () => {
  const manifest = definePluginManifest({
    id: "studio.weather",
    name: "Weather",
    version: "1.2.3-beta.1",
    engine: ">=0.1.0",
    permissions: ["network", "runtime"],
    entry: "dist/index.js",
  });
  expect(Object.isFrozen(manifest)).toBe(true);
  expect(Object.isFrozen(manifest.permissions)).toBe(true);
  expect(() => definePluginManifest({ ...manifest, version: "1.2" })).toThrow("version");
  expect(() => definePluginManifest({ ...manifest, entry: "../outside.js" })).toThrow("entry");
  expect(() => definePluginManifest({ ...manifest, permissions: ["runtime", "runtime"] })).toThrow(
    "unique",
  );
  expect(() =>
    definePluginManifest({
      ...manifest,
      permissions: ["root" as unknown as "runtime"],
    }),
  ).toThrow("permission");
});
