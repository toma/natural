import { relative, resolve } from "node:path";

import page from "./src/index.html";

const port = Number(process.env.PORT ?? 43400);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");

// Optional CC0 art lives under assets/ and is fetched, not committed. Serve it
// statically so the material loader can request it; a missing file 404s and the
// demo falls back to the procedural surface. See assets/ASSETS.md.
const assetsRoot = resolve(import.meta.dir, "assets");
async function serveAsset(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = resolve(assetsRoot, `.${url.pathname.slice("/assets".length)}`);
  const scoped = relative(assetsRoot, path);
  if (scoped.startsWith("..") || scoped === "") return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  development: true,
  routes: { "/": page, "/assets/*": serveAsset },
});
console.info(`NaturalFPS: http://127.0.0.1:${port}`);
