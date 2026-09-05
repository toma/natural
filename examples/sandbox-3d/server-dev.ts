import page from "./src/index.html";
Bun.serve({ port: Number(process.env.PORT ?? 3300), routes: { "/": page }, development: true });
console.info(`Natural Sandbox 3D: http://localhost:${process.env.PORT ?? 3300}`);
