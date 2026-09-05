#!/usr/bin/env bun
import { runCommand } from "./index.ts";

const args = Bun.argv.slice(2);
const json = args.includes("--json");
const filtered = args.filter((argument) => argument !== "--json");

try {
  const result = await runCommand(filtered, { cwd: process.cwd(), json });
  console.log(json ? JSON.stringify(result) : result.message);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(json ? JSON.stringify({ ok: false, error: message }) : `Natural: ${message}`);
  process.exitCode = 1;
}
