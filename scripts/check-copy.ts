import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Enforces the copy rules in AGENTS.md, section 4, on every tracked text file.

const root = resolve(import.meta.dir, "..");
const tracked = (await Bun.$`git ls-files -z`.cwd(root).text()).split("\0").filter(Boolean);
const binary =
  /\.(png|jpe?g|gif|ico|icns|webp|woff2?|ttf|otf|tgz|zip|pdf|lock|lockb|glb|gltf|bin|wasm|mp3|ogg|wav|spz)$/i;

// A file with a NUL byte near its start is binary, whatever its extension. This
// backs up the extension list so a new binary art format (a splat, a capture)
// never trips the text rules the way `.spz` splats did before being listed.
function looksBinary(bytes: Buffer): boolean {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return true;
  return false;
}
// These two files state the word rule, so they are the only ones allowed to contain the word.
const statesTheRule = new Set(["AGENTS.md", "scripts/check-copy.ts"]);
// The patterns use Unicode escapes so this definition file does not itself
// contain the characters it forbids, and needs no character-rule exemption.
const forbiddenCharacters: Array<[RegExp, string]> = [
  [/\u2014/, "em dash"],
  [/\u2013/, "en dash"],
  [/\u2026/, "ellipsis character"],
];
const forbiddenWord = /godot/i;

const problems: string[] = [];
let checked = 0;
for (const name of tracked) {
  if (binary.test(name)) continue;
  const bytes = await readFile(resolve(root, name));
  if (looksBinary(bytes)) continue;
  checked += 1;
  const lines = bytes.toString("utf8").split("\n");
  lines.forEach((line, index) => {
    for (const [pattern, label] of forbiddenCharacters)
      if (pattern.test(line)) problems.push(`${name}:${index + 1}: ${label}`);
    const word = statesTheRule.has(name) ? null : forbiddenWord.exec(line);
    if (word !== null) problems.push(`${name}:${index + 1}: mentions ${word[0]}`);
  });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  throw new Error(`${problems.length} copy rule violation(s); see AGENTS.md, section 4`);
}
console.info(`copy rules hold across ${checked} tracked text files`);
