import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { publishablePackages, repositoryRoot } from "./package-metadata.ts";
import { planFor, registryLookup } from "./release-plan.ts";

async function run(command: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const packages = await publishablePackages();
  const refName = process.env.GITHUB_REF_NAME;
  if (refName === undefined) throw new Error("GITHUB_REF_NAME must identify the release tag");
  const plan = planFor(packages, refName);

  if (dryRun) {
    console.info(JSON.stringify(plan));
    return;
  }

  if (process.env.NODE_AUTH_TOKEN === undefined || process.env.NODE_AUTH_TOKEN === "")
    throw new Error("NODE_AUTH_TOKEN is required to publish packages");

  const archiveRoot = resolve(repositoryRoot, ".natural/package-smoke/archives");
  for (const item of packages) {
    const archive = resolve(archiveRoot, item.archive);
    await access(archive);
    const lookupResult = await run([
      "npm",
      "view",
      `${item.name}@${plan.version}`,
      "version",
      "--json",
    ]);
    const lookup = registryLookup(
      lookupResult.code,
      lookupResult.stdout,
      lookupResult.stderr,
      plan.version,
    );
    if (lookup.status === "published") {
      console.info(`${item.name}@${plan.version} is already published`);
      continue;
    }
    if (lookup.status === "error")
      throw new Error(`Registry lookup failed for ${item.name}@${plan.version}`);

    const published = await run([
      "npm",
      "publish",
      archive,
      "--access",
      "public",
      "--provenance",
      "--tag",
      plan.tag,
    ]);
    if (published.code !== 0) throw new Error(`Publishing ${item.name}@${plan.version} failed`);
    console.info(`${item.name}@${plan.version} published with tag ${plan.tag}`);
  }
}

if (import.meta.main) await main();
