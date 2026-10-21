import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Enforces the copy rules in AGENTS.md, section 4, on every tracked text file.

const root = resolve(import.meta.dir, "..");
const tracked = (await Bun.$`git ls-files -z`.cwd(root).text()).split("\0").filter(Boolean);
const binary =
  /\.(png|jpe?g|gif|ico|icns|webp|woff2?|ttf|otf|tgz|zip|pdf|lock|lockb|glb|gltf|bin|wasm|mp3|ogg|wav)$/i;
// These two files state the word rule, so they are the only ones allowed to contain the word.
const statesTheRule = new Set(["AGENTS.md", "scripts/check-copy.ts"]);
const forbiddenCharacters: Array<[RegExp, string]> = [
  [/—/, "em dash"],
  [/–/, "en dash"],
  [/…/, "ellipsis character"],
];
const forbiddenWord = /godot/i;

const problems: string[] = [];
let checked = 0;
for (const name of tracked) {
  if (binary.test(name)) continue;
  checked += 1;
  const lines = (await readFile(resolve(root, name), "utf8")).split("\n");
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
