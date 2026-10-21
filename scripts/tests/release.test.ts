import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  archiveName,
  packageWorkspaces,
  publishablePackages,
  releaseTag,
  repositoryRoot,
  versionFromReleaseRef,
} from "../package-metadata.ts";
import { planFor, registryLookup, type ReleasePlan } from "../release-plan.ts";

test("the publish set contains every public package workspace exactly once", async () => {
  const workspaces = await packageWorkspaces();
  const packages = await publishablePackages();
  const expected = workspaces
    .filter((item) => !item.private)
    .map((item) => item.name)
    .sort();
  const actual = packages.map((item) => item.name).sort();
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
  for (const workspace of workspaces.filter((item) => item.private))
    expect(actual).not.toContain(workspace.name);
});

test("publish order follows internal dependencies and names every archive", async () => {
  const packages = await publishablePackages();
  const indexes = new Map(packages.map((item, index) => [item.name, index]));
  for (const [index, item] of packages.entries()) {
    expect(item.archive).toBe(archiveName(item.name, item.version));
    for (const dependency of item.internalDependencies)
      expect(indexes.get(dependency)).toBeLessThan(index);
  }
});

test("release versions select npm tags and reject mismatched refs", () => {
  expect(releaseTag("1.2.3")).toBe("latest");
  expect(releaseTag("1.2.3-rc.1")).toBe("next");
  expect(versionFromReleaseRef("v1.2.3", "1.2.3")).toBe("1.2.3");
  expect(() => versionFromReleaseRef("main", "1.2.3")).toThrow("version tag");
  expect(() => versionFromReleaseRef("v1.2.4", "1.2.3")).toThrow("does not match");
});

test("registry lookups make release reruns skip published versions", () => {
  expect(registryLookup(0, '"1.2.3"', "", "1.2.3")).toEqual({ status: "published" });
  expect(registryLookup(1, "", "npm error code E404", "1.2.3")).toEqual({
    status: "missing",
  });
  expect(registryLookup(1, "", "npm error code E401", "1.2.3")).toEqual({ status: "error" });
  expect(registryLookup(0, '"1.2.4"', "", "1.2.3")).toEqual({ status: "error" });
  expect(registryLookup(0, "invalid JSON", "", "1.2.3")).toEqual({ status: "error" });
});

test("release dry run and workflow use the shared publish plan", async () => {
  const packages = await publishablePackages();
  const version = packages[0]!.version;
  const child = Bun.spawn(["bun", "run", "scripts/publish-packages.ts", "--dry-run"], {
    cwd: repositoryRoot,
    env: { ...process.env, GITHUB_REF_NAME: `v${version}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stderr).toBe(0);
  const plan = JSON.parse(stdout) as ReleasePlan;
  expect(plan).toEqual({
    version,
    tag: releaseTag(version),
    requiresNodeAuthToken: true,
    rerunPolicy: "skip-existing",
    packages: packages.map(({ name, archive }) => ({ name, archive })),
  });
  expect(planFor(packages, `v${version}`)).toEqual(plan);
  expect(() => planFor([], `v${version}`)).toThrow("versions do not agree");
  expect(() =>
    planFor([{ ...packages[0]!, version: "9.9.9" }, packages[1]!], `v${version}`),
  ).toThrow("versions do not agree");

  const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/release.yml"), "utf8");
  expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
  expect(workflow).toContain("bun run scripts/publish-packages.ts");
  expect(workflow).toContain("id-token: write");
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("Verify release tag");
  expect(workflow).not.toMatch(/for package in/);

  const tagWorkflow = await readFile(resolve(repositoryRoot, ".github/workflows/tag.yml"), "utf8");
  expect(tagWorkflow).toContain("bun run verify:versions");
  expect(tagWorkflow).toContain("git rev-parse -q --verify");
  expect(tagWorkflow).toContain('gh workflow run release.yml --ref "${{ steps.v.outputs.tag }}"');
});

test("generated documentation resolves workflow badges and package links", async () => {
  const readme = await readFile(resolve(repositoryRoot, "README.md"), "utf8");
  const packageSection = readme
    .split("<!-- generated:packages:start -->")[1]!
    .split("<!-- generated:packages:end -->")[0]!;
  for (const item of await publishablePackages()) {
    const link = `https://www.npmjs.com/package/${item.name})`;
    expect(packageSection.split(link)).toHaveLength(2);
    expect(item.repository.directory).toBe(item.directory);
  }

  for (const file of ["ci.yml", "codeql.yml", "performance.yml", "release.yml"]) {
    const workflow = await readFile(resolve(repositoryRoot, ".github/workflows", file), "utf8");
    const name = /^name:\s*(.+)$/m.exec(workflow)?.[1]?.trim();
    expect(name).toBeDefined();
    expect(readme).toContain(`[![${name}]`);
    expect(readme).toContain(`/actions/workflows/${file}/badge.svg`);
  }

  const child = Bun.spawn(["bun", "run", "docs:check"], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
});
