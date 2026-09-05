const child = Bun.spawn(["bunx", "playwright", "test"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
process.exitCode = await child.exited;
