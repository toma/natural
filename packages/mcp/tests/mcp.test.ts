import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("MCP initializes, lists tools, and inspects a validated scene", async () => {
  const root = resolve(import.meta.dir, "../../..");
  const child = Bun.spawn(["bun", "run", "packages/mcp/src/main.ts"], {
    cwd: root,
    env: { ...process.env, NATURAL_PROJECT: resolve(root, "examples/arena-2d") },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "inspect_scene", arguments: { path: "scenes/main.scene.jsonc" } },
    },
  ];
  await child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
  await child.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exitCode, stderr).toBe(0);
  const responses = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { id: number; result: Record<string, unknown> });
  expect(responses).toHaveLength(3);
  expect(responses[0]?.result.serverInfo).toEqual({
    name: "natural-engine",
    version: "0.1.0-alpha.0",
  });
  expect((responses[1]?.result.tools as unknown[]).length).toBe(3);
  expect(JSON.stringify(responses[2]?.result)).toContain("Arena 2D");
});
