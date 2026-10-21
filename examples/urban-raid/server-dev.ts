import page from "./src/index.html";

const port = Number(process.env.PORT ?? 43400);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");
Bun.serve({ hostname: "127.0.0.1", port, routes: { "/": page }, development: true });
console.info(`NaturalFPS: http://127.0.0.1:${port}`);
