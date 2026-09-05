import { expect, test } from "bun:test";
import { AssetPipeline, createDefaultAssetPipeline, passthroughImporter } from "../src/index.ts";

test("asset imports are content addressed", async () => {
  const pipeline = createDefaultAssetPipeline();
  const first = await pipeline.import({ path: "player.png", bytes: new Uint8Array([1, 2, 3]) });
  const second = await pipeline.import({ path: "copy.png", bytes: new Uint8Array([1, 2, 3]) });
  expect(first.hash).toBe(second.hash);
  expect(first.type).toBe("texture");
  first.bytes[0] = 99;
  expect(second.bytes[0]).toBe(1);
  expect(Object.isFrozen(first.metadata)).toBe(true);
});

test("asset importer registration is validated and atomic", async () => {
  const pipeline = new AssetPipeline();
  expect(() => pipeline.register(passthroughImporter("bad id", "data", ["dat"]))).toThrow(
    "Invalid asset importer",
  );
  expect(() =>
    pipeline.register(passthroughImporter("test.duplicate", "data", ["dat", ".dat"])),
  ).toThrow("duplicate");
  pipeline.register(passthroughImporter("test.data", "data", ["dat"]));
  expect(() => pipeline.register(passthroughImporter("test.other", "data", ["dat"]))).toThrow(
    "already handles",
  );
  expect(pipeline.import({ path: "unknown.bin", bytes: new Uint8Array() })).rejects.toThrow(
    "No importer",
  );
  expect(pipeline.import({ path: "", bytes: new Uint8Array() })).rejects.toThrow("path");
});
