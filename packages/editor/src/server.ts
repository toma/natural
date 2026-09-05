import editor from "./index.html";
import { mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { canonicalJson, validateScene } from "@natural-engine/core";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

const projectRoot = await realpath(resolve(process.env.NATURAL_PROJECT ?? process.cwd()));
const maxSceneBytes = 16 * 1024 * 1024;
const port = Number(process.env.PORT ?? 3100);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
  throw new Error("PORT must be an integer from 0 to 65535");

async function safePath(relative: string): Promise<string> {
  const unresolved = resolve(projectRoot, relative);
  if (unresolved !== projectRoot && !unresolved.startsWith(`${projectRoot}${sep}`))
    throw new Error("Path escapes project root");
  const target = await realpath(unresolved);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}${sep}`))
    throw new Error("Path resolves outside project root");
  return target;
}

async function walk(root: string, relative = ""): Promise<string[]> {
  const result: string[] = [];
  try {
    for (const entry of await readdir(resolve(root, relative), { withFileTypes: true })) {
      if (["node_modules", ".git", ".natural", "dist"].includes(entry.name)) continue;
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) result.push(...(await walk(root, child)));
      else result.push(child);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return result;
}

const previewRoot = resolve(projectRoot, ".natural/editor-preview");
let builtRevision = "";
let previewBuild: Promise<void> | null = null;

async function buildPreview(revision: string): Promise<void> {
  if (builtRevision === revision) return;
  if (previewBuild !== null) await previewBuild;
  if (builtRevision === revision) return;
  previewBuild = (async () => {
    await rm(previewRoot, { recursive: true, force: true });
    await mkdir(previewRoot, { recursive: true });
    const result = await Bun.build({
      entrypoints: [resolve(projectRoot, "src/index.html")],
      outdir: previewRoot,
      target: "browser",
      sourcemap: "inline",
    });
    if (!result.success) throw new AggregateError(result.logs, "Game preview build failed");
    builtRevision = revision;
  })();
  try {
    await previewBuild;
  } finally {
    previewBuild = null;
  }
}

Bun.serve({
  port,
  hostname: process.env.HOST ?? "127.0.0.1",
  routes: {
    "/": editor,
    "/api/project": async () => {
      const files = await walk(projectRoot);
      return Response.json({
        root: projectRoot,
        name: basename(projectRoot),
        scenes: files.filter((path) => path.endsWith(".scene.jsonc")),
        assets: files.filter((path) =>
          [".png", ".jpg", ".glb", ".gltf", ".ogg", ".wav"].includes(extname(path)),
        ),
      });
    },
    "/api/scene": {
      GET: async (request) => {
        const path = new URL(request.url).searchParams.get("path");
        if (path === null) return Response.json({ error: "Missing path" }, { status: 400 });
        const source = await readFile(await safePath(path), "utf8");
        if (Buffer.byteLength(source) > maxSceneBytes)
          return Response.json({ error: "Scene exceeds 16 MiB" }, { status: 413 });
        const errors: ParseError[] = [];
        const scene: unknown = parse(source, errors, { allowTrailingComma: true });
        if (errors.length > 0)
          return Response.json(
            {
              error: errors
                .map((error) => `${printParseErrorCode(error.error)} at ${error.offset}`)
                .join(", "),
            },
            { status: 400 },
          );
        validateScene(scene);
        return Response.json(scene);
      },
      PUT: async (request) => {
        const path = new URL(request.url).searchParams.get("path");
        if (path === null) return Response.json({ error: "Missing path" }, { status: 400 });
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (Number.isFinite(contentLength) && contentLength > maxSceneBytes)
          return Response.json({ error: "Scene exceeds 16 MiB" }, { status: 413 });
        const source = await request.text();
        if (Buffer.byteLength(source) > maxSceneBytes)
          return Response.json({ error: "Scene exceeds 16 MiB" }, { status: 413 });
        let scene: unknown;
        try {
          scene = JSON.parse(source);
          validateScene(scene);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Invalid scene" },
            { status: 400 },
          );
        }
        const target = await safePath(path);
        const temporary = `${target}.natural-tmp-${process.pid}`;
        await writeFile(temporary, canonicalJson(scene));
        await rename(temporary, target);
        return Response.json({ ok: true });
      },
    },
  },
  fetch: async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/preview/")) return new Response("Not found", { status: 404 });
    try {
      const revision = url.searchParams.get("revision");
      if (revision !== null) await buildPreview(revision);
      else if (builtRevision === "") await buildPreview("0");
      const relative = url.pathname === "/preview/" ? "index.html" : url.pathname.slice(9);
      const target = resolve(previewRoot, relative);
      if (target !== previewRoot && !target.startsWith(`${previewRoot}${sep}`))
        return new Response("Not found", { status: 404 });
      const file = Bun.file(target);
      return (await file.exists())
        ? new Response(file, { headers: { "cache-control": "no-store" } })
        : new Response("Not found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(message, { status: 500 });
    }
  },
  development: process.env.NODE_ENV !== "production",
});

console.info(`Natural editor: http://${process.env.HOST ?? "127.0.0.1"}:${port}`);
