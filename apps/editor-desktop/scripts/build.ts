const defaults: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "app",
  linux: "appimage",
  win32: "nsis",
};

const bundles = process.env.NATURAL_DESKTOP_BUNDLES ?? defaults[process.platform];
if (bundles === undefined) {
  throw new Error(`Unsupported desktop build platform: ${process.platform}`);
}

const tauri = Bun.which("tauri");
if (tauri === null) throw new Error("Tauri CLI was not found; run bun install first");

const processHandle = Bun.spawn([tauri, "build", "--bundles", bundles], {
  cwd: new URL("..", import.meta.url).pathname,
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await processHandle.exited;
if (exitCode !== 0) process.exit(exitCode);

if (process.platform === "darwin") {
  const app = fileURLToPath(
    new URL("../src-tauri/target/release/bundle/macos/Natural%20Editor.app", import.meta.url),
  );
  const verification = Bun.spawn(["codesign", "--verify", "--deep", "--strict", app], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await verification.exited) !== 0) throw new Error("macOS application signature is invalid");
}
import { fileURLToPath } from "node:url";
