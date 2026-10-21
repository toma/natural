import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dir, "..");

interface PackageManifest {
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  repository?: {
    type?: string;
    url?: string;
    directory?: string;
  };
}

export interface PublishablePackage {
  name: string;
  version: string;
  description: string;
  directory: string;
  archive: string;
  internalDependencies: string[];
  repository: {
    type: "git";
    url: string;
    directory: string;
  };
}

export interface WorkspacePackage {
  name: string;
  directory: string;
  private: boolean;
}

async function packageManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8")) as PackageManifest;
}

export async function packageWorkspaces(): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  const glob = new Bun.Glob("packages/*/package.json");
  for await (const path of glob.scan({ cwd: repositoryRoot })) {
    const normalized = path.replaceAll("\\", "/");
    const manifest = await packageManifest(normalized);
    if (manifest.name === undefined) throw new Error(`${normalized} has no package name`);
    packages.push({
      name: manifest.name,
      directory: normalized.slice(0, -"/package.json".length),
      private: manifest.private === true,
    });
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function archiveName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export async function publishablePackages(): Promise<PublishablePackage[]> {
  const workspaces = await packageWorkspaces();
  const workspaceByName = new Map(workspaces.map((item) => [item.name, item]));
  const publicNames = new Set(workspaces.filter((item) => !item.private).map((item) => item.name));
  const rootManifest = await packageManifest("package.json");
  const repository = rootManifest.repository;
  const rootLicense = rootManifest.license;
  if (repository?.type !== "git" || repository.url === undefined)
    throw new Error("Root package.json has no git repository URL");
  if (rootLicense === undefined) throw new Error("Root package.json has no license");
  const packages: PublishablePackage[] = [];

  for (const workspace of workspaces) {
    if (workspace.private) continue;
    const path = `${workspace.directory}/package.json`;
    const manifest = await packageManifest(path);
    if (manifest.version === undefined) throw new Error(`${path} has no version`);
    if (manifest.description === undefined) throw new Error(`${path} has no description`);
    if (manifest.license !== rootLicense)
      throw new Error(`${path} license ${String(manifest.license)} does not match ${rootLicense}`);
    if (
      manifest.repository?.type !== "git" ||
      manifest.repository.url !== repository.url ||
      manifest.repository.directory !== workspace.directory
    )
      throw new Error(`${path} repository metadata does not identify ${workspace.directory}`);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    const privateDependencies = Object.keys(dependencies).filter(
      (name) => workspaceByName.get(name)?.private === true,
    );
    if (privateDependencies.length > 0)
      throw new Error(
        `${path} depends on private workspaces: ${privateDependencies.sort().join(", ")}`,
      );
    packages.push({
      name: workspace.name,
      version: manifest.version,
      description: manifest.description,
      directory: workspace.directory,
      archive: archiveName(workspace.name, manifest.version),
      internalDependencies: Object.keys(dependencies)
        .filter((name) => publicNames.has(name))
        .sort(),
      repository: {
        type: "git",
        url: repository.url,
        directory: workspace.directory,
      },
    });
  }

  const duplicates = packages.filter(
    (item, index) => packages.findIndex((candidate) => candidate.name === item.name) !== index,
  );
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate publishable package names: ${duplicates.map((item) => item.name).join(", ")}`,
    );

  const ordered: PublishablePackage[] = [];
  const remaining = new Map(packages.map((item) => [item.name, item]));
  while (remaining.size > 0) {
    const next = [...remaining.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .find((item) => item.internalDependencies.every((name) => !remaining.has(name)));
    if (next === undefined)
      throw new Error(
        `Publishable package dependency cycle: ${[...remaining.keys()].sort().join(", ")}`,
      );
    ordered.push(next);
    remaining.delete(next.name);
  }
  return ordered;
}

export function releaseTag(version: string): "latest" | "next" {
  return version.includes("-") ? "next" : "latest";
}

export function versionFromReleaseRef(refName: string, expected: string): string {
  if (!refName.startsWith("v")) throw new Error(`Release ref ${refName} is not a version tag`);
  const version = refName.slice(1);
  if (version !== expected) throw new Error(`Release ref ${refName} does not match v${expected}`);
  return version;
}
