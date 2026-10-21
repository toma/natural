import { relative, resolve } from "node:path";

const port = Number(process.env.PORT ?? 43400);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");
const root = resolve(import.meta.dir, "dist");
Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const path = resolve(root, url.pathname === "/" ? "index.html" : `.${url.pathname}`);
    const scoped = relative(root, path);
    if (scoped.startsWith("..") || scoped === "") return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.info(`NaturalFPS: http://127.0.0.1:${port}`);
