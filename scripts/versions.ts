import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const root = resolve(import.meta.dir, "..");
export const changelog = "CHANGELOG.md";
export const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** One place a version string is written. `pattern` captures (prefix, version, suffix). */
export interface Site {
  /** Repository-relative path, used in messages. */
  name: string;
  /** Global patterns cover every match in the file; others cover the first. */
  pattern: RegExp;
  /** When set, only the text before this marker's first match is searched. */
  endMarker?: RegExp;
}

export interface Finding {
  name: string;
  versions: string[];
}

async function readJson(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, name), "utf8")) as Record<string, unknown>;
}

export async function rootVersion(): Promise<string> {
  const version = (await readJson("package.json")).version;
  if (typeof version !== "string") throw new Error("Root package.json has no version field");
  return version;
}

async function workspaceManifests(): Promise<string[]> {
  const workspaces = (await readJson("package.json")).workspaces;
  if (!Array.isArray(workspaces)) throw new Error("Root package.json has no workspaces field");
  const manifests: string[] = [];
  for (const workspace of workspaces as string[]) {
    const glob = new Bun.Glob(`${workspace}/package.json`);
    for await (const path of glob.scan({ cwd: root })) manifests.push(path.replaceAll("\\", "/"));
  }
  return manifests.sort();
}

// Every package.json and tauri.conf.json is prettier-formatted, so the top-level field is indented
// by exactly two spaces. Dependency ranges live deeper and never match.
const manifestVersion = /^( {2}"version": ")([^"]+)(")/m;

/** Every file that carries the release version, in the order the bump rewrites them. */
export async function sites(): Promise<Site[]> {
  const manifests = await workspaceManifests();
  return [
    { name: "package.json", pattern: manifestVersion },
    ...manifests.map((name): Site => ({ name, pattern: manifestVersion })),
    { name: "apps/editor-desktop/src-tauri/tauri.conf.json", pattern: manifestVersion },
    { name: "apps/editor-desktop/src-tauri/Cargo.toml", pattern: /^(version = ")([^"]+)(")/m },
    {
      name: "apps/editor-desktop/src-tauri/Cargo.lock",
      pattern: /(\[\[package\]\]\r?\nname = "natural-editor"\r?\nversion = ")([^"]+)(")/,
    },
    {
      // Generated projects depend on the release that generated them.
      name: "packages/cli/src/template.ts",
      pattern: /("@toma\.com\/(?:natural|cli)": "\^)([^"]+)(")/g,
    },
    {
      // Workspace entries copy each package's version; the resolved package list below them does not.
      name: "bun.lock",
      pattern: /^( {6}"version": ")([^"]+)(")/gm,
      endMarker: /^ {2}"packages": \{/m,
    },
  ];
}

function searchScope(site: Site, text: string): string {
  if (site.endMarker === undefined) return text;
  const end = site.endMarker.exec(text)?.index;
  if (end === undefined) throw new Error(`${site.name} has no ${String(site.endMarker)} marker`);
  return text.slice(0, end);
}

export function matchVersions(site: Site, text: string): string[] {
  const scope = searchScope(site, text);
  if (site.pattern.global) return [...scope.matchAll(site.pattern)].map((match) => match[2]!);
  const match = site.pattern.exec(scope);
  return match === null ? [] : [match[2]!];
}

export function replaceVersions(site: Site, text: string, next: string): string {
  const scope = searchScope(site, text);
  return scope.replace(site.pattern, `$1${next}$3`) + text.slice(scope.length);
}

export async function findVersions(): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const site of await sites()) {
    const text = await readFile(resolve(root, site.name), "utf8");
    findings.push({ name: site.name, versions: matchVersions(site, text) });
  }
  return findings;
}

/** Every `## X.Y.Z` heading version in the changelog, newest first. */
export async function changelogVersions(): Promise<string[]> {
  const text = await readFile(resolve(root, changelog), "utf8");
  return [...text.matchAll(/^## (\S+)/gm)].map((match) => match[1]!);
}

/** Human-readable disagreements with `expected`; an empty list means every site agrees. */
export async function mismatches(expected: string): Promise<string[]> {
  const problems: string[] = [];
  for (const finding of await findVersions()) {
    if (finding.versions.length === 0) problems.push(`${finding.name}: no version found`);
    for (const version of finding.versions)
      if (version !== expected) problems.push(`${finding.name}: ${version} != ${expected}`);
  }
  if (!(await changelogVersions()).includes(expected))
    problems.push(`${changelog}: no "## ${expected}" heading`);
  return problems;
}
