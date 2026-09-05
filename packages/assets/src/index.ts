export interface AssetSource {
  path: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface ImportedAsset {
  hash: string;
  type: string;
  bytes: Uint8Array;
  metadata: Readonly<Record<string, unknown>>;
}

export interface AssetImporter {
  readonly id: string;
  readonly extensions: readonly string[];
  import(source: AssetSource): Promise<Omit<ImportedAsset, "hash">>;
}

export class AssetPipeline {
  readonly #importers = new Map<string, AssetImporter>();

  register(importer: AssetImporter): void {
    if (!/^[a-z][a-z0-9.-]+$/.test(importer.id))
      throw new Error(`Invalid asset importer id: ${importer.id}`);
    if (importer.extensions.length === 0)
      throw new Error(`Asset importer ${importer.id} must declare an extension`);
    const normalizedExtensions = importer.extensions.map((extension) =>
      extension.toLowerCase().replace(/^\./, ""),
    );
    if (normalizedExtensions.some((extension) => !/^[a-z0-9]+$/.test(extension)))
      throw new Error(`Asset importer ${importer.id} contains an invalid extension`);
    if (new Set(normalizedExtensions).size !== normalizedExtensions.length)
      throw new Error(`Asset importer ${importer.id} contains duplicate extensions`);
    for (const normalized of normalizedExtensions) {
      if (this.#importers.has(normalized))
        throw new Error(`Asset importer already handles .${normalized}`);
    }
    for (const normalized of normalizedExtensions) {
      this.#importers.set(normalized, importer);
    }
  }

  async import(source: AssetSource): Promise<ImportedAsset> {
    if (source.path.trim() === "" || source.path.includes("\0"))
      throw new Error("Asset source path must not be empty or contain null bytes");
    if (!(source.bytes instanceof Uint8Array))
      throw new Error("Asset source bytes must be Uint8Array");
    const extension = source.path.split(".").at(-1)?.toLowerCase() ?? "";
    const importer = this.#importers.get(extension);
    if (importer === undefined) throw new Error(`No importer registered for ${source.path}`);
    const result = await importer.import(source);
    if (!(result.bytes instanceof Uint8Array))
      throw new Error(`Asset importer ${importer.id} returned invalid bytes`);
    if (result.type.trim() === "")
      throw new Error(`Asset importer ${importer.id} returned an empty type`);
    if (typeof result.metadata !== "object" || result.metadata === null)
      throw new Error(`Asset importer ${importer.id} returned invalid metadata`);
    const bytes = Uint8Array.from(result.bytes);
    const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return { ...result, bytes, metadata: Object.freeze({ ...result.metadata }), hash };
  }
}

export const passthroughImporter = (
  id: string,
  type: string,
  extensions: readonly string[],
): AssetImporter => ({
  id,
  extensions,
  import: (source) =>
    Promise.resolve({
      type,
      bytes: Uint8Array.from(source.bytes),
      metadata: { source: source.path, mimeType: source.mimeType },
    }),
});

export function createDefaultAssetPipeline(): AssetPipeline {
  const pipeline = new AssetPipeline();
  pipeline.register(
    passthroughImporter("natural.image", "texture", ["png", "jpg", "jpeg", "webp", "ktx2"]),
  );
  pipeline.register(passthroughImporter("natural.model", "model", ["gltf", "glb"]));
  pipeline.register(passthroughImporter("natural.audio", "audio", ["wav", "mp3", "ogg"]));
  pipeline.register(passthroughImporter("natural.font", "font", ["woff2", "ttf", "otf"]));
  pipeline.register(passthroughImporter("natural.tilemap", "tilemap", ["tmj", "tmx"]));
  return pipeline;
}
