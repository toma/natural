import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { validateScene } from "@toma.com/core";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import {
  desktopBuild,
  desktopCargo,
  desktopConfig,
  desktopMain,
  gameEntry,
  gameHtml,
  projectAgents,
  projectConfig,
  projectGitignore,
  projectPackage,
  projectReadme,
  projectTest,
  projectTsconfig,
  sceneTemplate,
  serverEntry,
} from "./template.ts";

export interface CommandResult {
  ok: boolean;
  command: string;
  message: string;
  data?: unknown;
}

export interface CommandContext {
  cwd: string;
  json: boolean;
}

function assertProjectName(name: string): void {
  if (!/^[a-z][a-z0-9-]+$/.test(name)) throw new Error("Project name must be lowercase kebab-case");
}

export async function createProject(context: CommandContext, name: string): Promise<CommandResult> {
  assertProjectName(name);
  const root = resolve(context.cwd, name);
  try {
    await stat(root);
    throw new Error(`Target already exists: ${root}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(resolve(root, "src"), { recursive: true });
  await mkdir(resolve(root, "scenes"), { recursive: true });
  await mkdir(resolve(root, "tests"), { recursive: true });
  await mkdir(resolve(root, "src-tauri", "src"), { recursive: true });
  await mkdir(resolve(root, "src-tauri", "icons"), { recursive: true });
  const templateRoot = resolve(import.meta.dir, "..", "templates");
  await Promise.all([
    writeFile(resolve(root, "package.json"), projectPackage(name)),
    writeFile(resolve(root, "natural.config.ts"), projectConfig(name)),
    writeFile(resolve(root, "src", "main.ts"), gameEntry),
    writeFile(resolve(root, "src", "index.html"), gameHtml),
    writeFile(resolve(root, "server.ts"), serverEntry),
    writeFile(resolve(root, "tests", "game.test.ts"), projectTest),
    writeFile(resolve(root, "tsconfig.json"), projectTsconfig),
    writeFile(resolve(root, "README.md"), projectReadme(name)),
    writeFile(resolve(root, "AGENTS.md"), projectAgents),
    writeFile(resolve(root, ".gitignore"), projectGitignore),
    writeFile(resolve(root, "scenes", "main.scene.jsonc"), sceneTemplate(name)),
    writeFile(resolve(root, "src-tauri", "Cargo.toml"), desktopCargo(name)),
    writeFile(resolve(root, "src-tauri", "build.rs"), desktopBuild),
    writeFile(resolve(root, "src-tauri", "src", "main.rs"), desktopMain),
    writeFile(resolve(root, "src-tauri", "tauri.conf.json"), desktopConfig(name)),
    copyFile(resolve(templateRoot, "icons", "icon.png"), resolve(root, "src-tauri/icons/icon.png")),
    copyFile(
      resolve(templateRoot, "icons", "icon.icns"),
      resolve(root, "src-tauri/icons/icon.icns"),
    ),
    copyFile(resolve(templateRoot, "icons", "icon.ico"), resolve(root, "src-tauri/icons/icon.ico")),
  ]);
  return { ok: true, command: "create", message: `Created ${name}`, data: { root } };
}

export async function inspectScene(context: CommandContext, path: string): Promise<CommandResult> {
  const projectRoot = await realpath(context.cwd);
  const target = resolve(projectRoot, path);
  if (!target.startsWith(`${projectRoot}${sep}`))
    throw new Error("Scene path escapes the project root");
  const resolvedTarget = await realpath(target);
  if (!resolvedTarget.startsWith(`${projectRoot}${sep}`))
    throw new Error("Scene path resolves outside the project root");
  const source = await readFile(resolvedTarget, "utf8");
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(
      errors.map((error) => `${printParseErrorCode(error.error)} at ${error.offset}`).join(", "),
    );
  }
  validateScene(value);
  return { ok: true, command: "inspect", message: `Inspected ${path}`, data: value };
}

export async function doctor(context: CommandContext): Promise<CommandResult> {
  const checks = {
    bun: Bun.version,
    packageJson: await Bun.file(resolve(context.cwd, "package.json")).exists(),
    config: await Bun.file(resolve(context.cwd, "natural.config.ts")).exists(),
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
  };
  return {
    ok: checks.packageJson,
    command: "doctor",
    message: checks.packageJson ? "Natural environment is ready" : "No package.json found",
    data: checks,
  };
}

export async function buildProject(
  context: CommandContext,
  production = true,
): Promise<CommandResult> {
  const entry = resolve(context.cwd, "src", "index.html");
  if (!(await Bun.file(entry).exists())) throw new Error("Natural build requires src/index.html");
  await rm(resolve(context.cwd, "dist"), { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: resolve(context.cwd, "dist"),
    target: "browser",
    minify: production,
    sourcemap: production ? "linked" : "inline",
  });
  if (!result.success) throw new AggregateError(result.logs, "Natural build failed");
  return {
    ok: true,
    command: "build",
    message: "Built project",
    data: { outputs: result.outputs.map((output) => output.path) },
  };
}

export async function exportProject(
  context: CommandContext,
  target: "web" | "desktop" | "server",
): Promise<CommandResult> {
  if (target === "web") return buildProject(context, true);
  if (target === "desktop") {
    await buildProject(context, true);
    const defaultBundles: Partial<Record<NodeJS.Platform, string>> = {
      darwin: "app",
      linux: "appimage",
      win32: "nsis",
    };
    const bundles = process.env.NATURAL_DESKTOP_BUNDLES ?? defaultBundles[process.platform];
    if (bundles === undefined) throw new Error(`Unsupported desktop platform: ${process.platform}`);
    const child = Bun.spawn(["bunx", "tauri", "build", "--bundles", bundles], {
      cwd: context.cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    return {
      ok: exitCode === 0,
      command: "export",
      message: `Desktop export exited with ${exitCode}`,
      data: { target, exitCode },
    };
  }
  const entry = resolve(context.cwd, "server.ts");
  if (!(await Bun.file(entry).exists())) throw new Error("Server export requires server.ts");
  await mkdir(resolve(context.cwd, "dist"), { recursive: true });
  const outfile = resolve(
    context.cwd,
    "dist",
    process.platform === "win32" ? "server.exe" : "server",
  );
  const child = Bun.spawn(
    ["bun", "build", "--compile", "--minify", "--sourcemap", entry, "--outfile", outfile],
    { cwd: context.cwd, stdout: "inherit", stderr: "inherit" },
  );
  const exitCode = await child.exited;
  return {
    ok: exitCode === 0,
    command: "export",
    message: `Server export exited with ${exitCode}`,
    data: { target, exitCode, outfile },
  };
}

export async function runCommand(
  args: readonly string[],
  context: CommandContext,
): Promise<CommandResult> {
  const [command = "help", ...rest] = args;
  if (command === "create") return createProject(context, rest[0] ?? "natural-game");
  if (command === "inspect") return inspectScene(context, rest[0] ?? "scenes/main.scene.jsonc");
  if (command === "doctor") return doctor(context);
  if (command === "build") return buildProject(context, true);
  if (command === "export") {
    const requested =
      rest.find((argument) => argument.startsWith("--target="))?.slice("--target=".length) ?? "web";
    if (requested !== "web" && requested !== "desktop" && requested !== "server") {
      throw new Error(`Unknown export target: ${requested}`);
    }
    return exportProject(context, requested);
  }
  if (command === "test") {
    const process = Bun.spawn(["bun", "test"], {
      cwd: context.cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await process.exited;
    return {
      ok: exitCode === 0,
      command,
      message: `Tests exited with ${exitCode}`,
      data: { exitCode },
    };
  }
  if (command === "bench") {
    const process = Bun.spawn(["bun", "run", "bench"], {
      cwd: context.cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await process.exited;
    return {
      ok: exitCode === 0,
      command,
      message: `Benchmarks exited with ${exitCode}`,
      data: { exitCode },
    };
  }
  if (command === "dev" || command === "editor") {
    const built = await buildProject(context, false);
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
      throw new Error("PORT must be an integer from 0 to 65535");
    const distRoot = resolve(context.cwd, "dist");
    const server = Bun.serve({
      port,
      hostname: process.env.HOST ?? "127.0.0.1",
      async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
        const target = resolve(distRoot, `.${path.replaceAll("\\", "/")}`);
        if (!target.startsWith(`${distRoot}${sep}`))
          return new Response("Not found", { status: 404 });
        const file = Bun.file(target);
        return (await file.exists())
          ? new Response(file)
          : new Response("Not found", { status: 404 });
      },
    });
    return { ...built, command, message: `Natural dev server listening on ${server.url}` };
  }
  return {
    ok: true,
    command: "help",
    message:
      "natural <create|dev|editor|build|export --target=web|desktop|server|test|bench|doctor|inspect>",
  };
}
