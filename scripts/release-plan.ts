import { releaseTag, versionFromReleaseRef, type PublishablePackage } from "./package-metadata.ts";

export type RegistryLookup = { status: "published" } | { status: "missing" } | { status: "error" };

export interface ReleasePlan {
  version: string;
  tag: "latest" | "next";
  requiresNodeAuthToken: true;
  rerunPolicy: "skip-existing";
  packages: Array<Pick<PublishablePackage, "name" | "archive">>;
}

export function registryLookup(
  exitCode: number,
  output: string,
  error: string,
  version: string,
): RegistryLookup {
  if (exitCode === 0) {
    try {
      return JSON.parse(output) === version ? { status: "published" } : { status: "error" };
    } catch {
      return { status: "error" };
    }
  }
  return /(?:E404|404 Not Found)/i.test(error) ? { status: "missing" } : { status: "error" };
}

export function planFor(packages: PublishablePackage[], refName: string): ReleasePlan {
  const versions = new Set(packages.map((item) => item.version));
  if (versions.size !== 1) throw new Error("Publishable package versions do not agree");
  const expected = packages[0]!.version;
  const version = versionFromReleaseRef(refName, expected);
  return {
    version,
    tag: releaseTag(version),
    requiresNodeAuthToken: true,
    rerunPolicy: "skip-existing",
    packages: packages.map(({ name, archive }) => ({ name, archive })),
  };
}
