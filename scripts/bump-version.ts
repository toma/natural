import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  changelog,
  changelogVersions,
  mismatches,
  replaceVersions,
  root,
  rootVersion,
  semver,
  sites,
} from "./versions.ts";

const usage = "usage: bun run version:bump <patch|minor|major|prerelease|X.Y.Z[-pre]> [--dry-run]";

/**
 * npm's `version` semantics: a patch, minor, or major bump on a prerelease first lands the release
 * it was leading up to. `prerelease` increments the trailing number, or starts an `alpha.0` line
 * from a stable version.
 */
function nextVersion(current: string, request: string): string {
  const parsed = semver.exec(current);
  if (parsed === null) throw new Error(`Current version ${current} is not semver`);
  const major = Number(parsed[1]);
  const minor = Number(parsed[2]);
  const patch = Number(parsed[3]);
  const prerelease = parsed[4];
  switch (request) {
    case "major":
      return prerelease !== undefined && minor === 0 && patch === 0
        ? `${major}.0.0`
        : `${major + 1}.0.0`;
    case "minor":
      return prerelease !== undefined && patch === 0
        ? `${major}.${minor}.0`
        : `${major}.${minor + 1}.0`;
    case "patch":
      return prerelease !== undefined
        ? `${major}.${minor}.${patch}`
        : `${major}.${minor}.${patch + 1}`;
    case "prerelease": {
      if (prerelease === undefined) return `${major}.${minor}.${patch + 1}-alpha.0`;
      const ids = prerelease.split(".");
      const last = ids[ids.length - 1]!;
      if (/^\d+$/.test(last)) ids[ids.length - 1] = String(Number(last) + 1);
      else ids.push("0");
      return `${major}.${minor}.${patch}-${ids.join(".")}`;
    }
    default:
      if (!semver.test(request))
        throw new Error(`${request} is neither a bump kind nor a semver version\n${usage}`);
      return request;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const request = args.find((arg) => !arg.startsWith("--"));
if (request === undefined) throw new Error(usage);

const current = await rootVersion();
const next = nextVersion(current, request);
if (next === current) {
  console.info(`nothing to do: already ${current}`);
  process.exit(0);
}

const changed: string[] = [];
for (const site of await sites()) {
  const path = resolve(root, site.name);
  const text = await readFile(path, "utf8");
  const replaced = replaceVersions(site, text, next);
  if (replaced === text) continue;
  changed.push(site.name);
  if (!dryRun) await writeFile(path, replaced);
}

if (!(await changelogVersions()).includes(next)) {
  const path = resolve(root, changelog);
  const text = await readFile(path, "utf8");
  const heading = `## ${next} - ${new Date().toISOString().slice(0, 10)}\n\n`;
  const firstHeading = text.search(/^## /m);
  const updated =
    firstHeading === -1
      ? `${text.trimEnd()}\n\n${heading}`
      : `${text.slice(0, firstHeading)}${heading}${text.slice(firstHeading)}`;
  changed.push(`${changelog} (new heading; add the entries under it)`);
  if (!dryRun) await writeFile(path, updated);
}

console.info(`${dryRun ? "would bump" : "bumped"} ${current} -> ${next}`);
for (const name of changed) console.info(`  ${name}`);

if (!dryRun) {
  const problems = await mismatches(next);
  if (problems.length > 0)
    throw new Error(`Version sites still disagree after the bump:\n${problems.join("\n")}`);
  console.info("every version site agrees; write the CHANGELOG entries and commit");
}
