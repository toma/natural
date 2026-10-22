import { relative, resolve } from "node:path";

const port = Number(process.env.PORT ?? 43400);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");
const root = resolve(import.meta.dir, "dist");
Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    // Optional CC0 art is fetched into assets/, not built into dist/; serve it
    // from there. A missing file 404s and the demo uses the procedural surface.
    const base = url.pathname.startsWith("/assets/") ? resolve(import.meta.dir, "assets") : root;
    const rel =
      url.pathname === "/"
        ? "index.html"
        : url.pathname.startsWith("/assets/")
          ? `.${url.pathname.slice("/assets".length)}`
          : `.${url.pathname}`;
    const path = resolve(base, rel);
    const scoped = relative(base, path);
    if (scoped.startsWith("..") || scoped === "") return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.info(`NaturalFPS: http://127.0.0.1:${port}`);
