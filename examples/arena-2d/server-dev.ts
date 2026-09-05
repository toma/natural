import page from "./src/index.html";
Bun.serve({ port: Number(process.env.PORT ?? 3200), routes: { "/": page }, development: true });
console.info(`Natural Arena 2D: http://localhost:${process.env.PORT ?? 3200}`);
