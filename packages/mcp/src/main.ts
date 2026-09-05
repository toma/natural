#!/usr/bin/env bun
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { canonicalJson, validateScene, type SceneData } from "@natural-engine/core";
import { parse } from "jsonc-parser";

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const root = await realpath(resolve(process.env.NATURAL_PROJECT ?? process.cwd()));

async function safeExistingPath(path: string): Promise<string> {
  const unresolved = resolve(root, path);
  if (unresolved !== root && !unresolved.startsWith(`${root}${sep}`))
    throw new Error("Path escapes project root");
  const target = await realpath(unresolved);
  if (target !== root && !target.startsWith(`${root}${sep}`))
    throw new Error("Path resolves outside project root");
  return target;
}

async function safeWritablePath(path: string): Promise<string> {
  if (!path.endsWith(".scene.jsonc")) throw new Error("Only Natural scene files can be written");
  const target = resolve(root, path);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Path escapes project root");
  const parent = await realpath(resolve(target, ".."));
  if (parent !== root && !parent.startsWith(`${root}${sep}`))
    throw new Error("Path resolves outside project root");
  return target;
}

function respond(id: RpcRequest["id"], result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id: RpcRequest["id"], error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`,
  );
}

const tools = [
  {
    name: "inspect_scene",
    description: "Read and validate a Natural JSONC scene",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_scene",
    description: "Validate and atomically write a complete Natural scene",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, scene: { type: "object" } },
      required: ["path", "scene"],
    },
  },
  {
    name: "run_checks",
    description: "Run Natural type checks and tests and return structured output",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "inspect_scene") {
    const source = await readFile(await safeExistingPath(String(args.path)), "utf8");
    const scene: unknown = parse(source);
    validateScene(scene as SceneData);
    return { content: [{ type: "text", text: canonicalJson(scene) }] };
  }
  if (name === "write_scene") {
    const scene = args.scene as SceneData;
    validateScene(scene);
    const target = await safeWritablePath(String(args.path));
    const temporary = `${target}.natural-tmp-${process.pid}`;
    await writeFile(temporary, canonicalJson(scene));
    await rename(temporary, target);
    return { content: [{ type: "text", text: `Saved ${args.path as string}` }] };
  }
  if (name === "run_checks") {
    const child = Bun.spawn(["bun", "run", "check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify({ exitCode, stdout, stderr }) }],
      isError: exitCode !== 0,
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(request: RpcRequest): Promise<void> {
  if (request.method === "initialize") {
    respond(request.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "natural-engine", version: "0.1.0-alpha.0" },
    });
    return;
  }
  if (request.method === "notifications/initialized") return;
  if (request.method === "tools/list") {
    respond(request.id, { tools });
    return;
  }
  if (request.method === "tools/call") {
    const rawName = request.params?.name;
    if (typeof rawName !== "string") throw new Error("Tool name must be a string");
    const name = rawName;
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
    respond(request.id, await callTool(name, args));
    return;
  }
  throw new Error(`Unknown method: ${request.method}`);
}

let buffered = "";
for await (const chunk of process.stdin) {
  buffered += String(chunk);
  if (buffered.length > 16 * 1024 * 1024) {
    fail(undefined, new Error("JSON-RPC request exceeds 16 MiB"));
    buffered = "";
  }
  let newline = buffered.indexOf("\n");
  while (newline >= 0) {
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (line !== "") {
      let request: RpcRequest | undefined;
      try {
        request = JSON.parse(line) as RpcRequest;
        await handle(request);
      } catch (error) {
        fail(request?.id, error);
      }
    }
    newline = buffered.indexOf("\n");
  }
}
