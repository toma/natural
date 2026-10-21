import { mismatches, rootVersion, semver } from "./versions.ts";

const expected = await rootVersion();
if (!semver.test(expected)) throw new Error(`Root version ${expected} is not semver`);

const problems = await mismatches(expected);
if (problems.length > 0) throw new Error(`Version sites disagree:\n${problems.join("\n")}`);

// GitHub sets GITHUB_REF_TYPE to "tag" only for tag refs. On a push to main it is "branch", and the
// ref name is "main", so the tag check must not run there.
const tag = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_REF_TYPE === "tag" && tag !== `v${expected}`)
  throw new Error(`Release tag ${String(tag)} does not match v${expected}`);

console.info(`all release versions match ${expected}`);
