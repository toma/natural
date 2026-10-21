import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";

import { publishablePackages, repositoryRoot } from "./package-metadata.ts";

interface RootManifest {
  license?: string;
  packageManager?: string;
  repository?: { url?: string };
}

interface GeneratedSection {
  name: string;
  content: string;
}

function repositorySlug(url: string): string {
  const match = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
  if (match === null) throw new Error(`Cannot derive GitHub repository from ${url}`);
  return match[1]!;
}

async function workflowName(file: string): Promise<string> {
  const text = await readFile(resolve(repositoryRoot, ".github/workflows", file), "utf8");
  const name = /^name:\s*["']?([^\n"']+)["']?\s*$/m.exec(text)?.[1]?.trim();
  if (name === undefined) throw new Error(`${file} has no workflow name`);
  return name;
}

function replaceSection(readme: string, section: GeneratedSection): string {
  const start = `<!-- generated:${section.name}:start -->`;
  const end = `<!-- generated:${section.name}:end -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(readme)) throw new Error(`README.md has no generated ${section.name} section`);
  return readme.replace(pattern, `${start}\n${section.content.trim()}\n${end}`);
}

const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as RootManifest;
const repositoryUrl = manifest.repository?.url;
if (repositoryUrl === undefined) throw new Error("package.json has no repository URL");
const repository = repositorySlug(repositoryUrl);
const license = manifest.license;
if (license === undefined) throw new Error("package.json has no license field");
const runtime = manifest.packageManager;
if (runtime === undefined) throw new Error("package.json has no packageManager field");
const [runtimeName, runtimeVersion] = runtime.split("@");
if (runtimeName !== "bun" || runtimeVersion === undefined)
  throw new Error(`Unsupported package manager ${runtime}`);

const workflows = await Promise.all(
  ["ci.yml", "codeql.yml", "performance.yml", "release.yml"].map(async (file) => ({
    file,
    name: await workflowName(file),
  })),
);
const packages = await publishablePackages();
const umbrella = packages.find((item) => item.directory === "packages/natural")?.name;
if (umbrella === undefined) throw new Error("No umbrella package found at packages/natural");
const encodedUmbrella = encodeURIComponent(umbrella);
const badges = [
  ...workflows.map(
    ({ file, name }) =>
      `[![${name}](https://github.com/${repository}/actions/workflows/${file}/badge.svg)](https://github.com/${repository}/actions/workflows/${file})`,
  ),
  `[![npm version](https://img.shields.io/npm/v/${encodedUmbrella}?color=cb3837)](https://www.npmjs.com/package/${umbrella})`,
  `[![npm downloads](https://img.shields.io/npm/dt/${encodedUmbrella}?color=blue)](https://www.npmjs.com/package/${umbrella})`,
  `[![License: ${license}](https://img.shields.io/github/license/${repository}?color=blue)](LICENSE)`,
  `[![Runtime: Bun ${runtimeVersion}](https://img.shields.io/badge/runtime-Bun%20${runtimeVersion}-f9f1e1?logo=bun)](https://bun.sh)`,
].join("\n");

const packageRows = packages
  .slice()
  .sort((left, right) => left.name.localeCompare(right.name))
  .map(
    (item) =>
      `| [\`${item.name}\`](https://www.npmjs.com/package/${item.name}) | ${item.description} | \`${item.version}\` |`,
  )
  .join("\n");
const packageCatalog = `## Published packages

Every public package is released together from the same version tag.

| Package | Purpose | Version |
| --- | --- | --- |
${packageRows}`;

const contributions = `## Contribution paths

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then use the path that matches the change.

| Area | Start here | Validation |
| --- | --- | --- |
| Code | [Packages](packages) | \`bun run check\` |
| Tests | [Testing guide](docs/testing.md) | \`bun run test\` |
| Documentation | [Documentation](docs) | \`bun run docs:check\` |
| Examples | [Examples](examples) | \`bun run build\` and \`bun run test:e2e\` |
| Performance | [Performance gates](docs/testing.md#performance-gates) | \`bun run test:network\` and \`bun run bench\` |
| Security | [Security policy](SECURITY.md) | Follow the private reporting process |`;

const sections: GeneratedSection[] = [
  { name: "badges", content: badges },
  { name: "packages", content: packageCatalog },
  { name: "contributions", content: contributions },
];
const readmePath = resolve(repositoryRoot, "README.md");
const current = await readFile(readmePath, "utf8");
const generated = await format(`${sections.reduce(replaceSection, current).trimEnd()}\n`, {
  filepath: readmePath,
});
if (process.argv.includes("--check")) {
  if (generated !== current)
    throw new Error("README.md generated sections are stale; run bun run docs:generate");
  console.info("README.md generated sections are current");
} else {
  await writeFile(readmePath, generated);
  console.info("generated README.md status, package, and contribution sections");
}
