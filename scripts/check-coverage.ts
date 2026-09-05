import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(import.meta.dir, "../coverage/lcov.info"), "utf8");
let linesFound = 0;
let linesHit = 0;
let functionsFound = 0;
let functionsHit = 0;
for (const line of source.split("\n")) {
  const value = Number(line.slice(line.indexOf(":") + 1));
  if (line.startsWith("LF:")) linesFound += value;
  else if (line.startsWith("LH:")) linesHit += value;
  else if (line.startsWith("FNF:")) functionsFound += value;
  else if (line.startsWith("FNH:")) functionsHit += value;
}

const ratio = (hit: number, found: number): number => (found === 0 ? 1 : hit / found);
const lineCoverage = ratio(linesHit, linesFound);
const functionCoverage = ratio(functionsHit, functionsFound);
const required = 0.85;
console.info(
  JSON.stringify({
    lines: Number((lineCoverage * 100).toFixed(2)),
    functions: Number((functionCoverage * 100).toFixed(2)),
    required: required * 100,
  }),
);
if (lineCoverage < required || functionCoverage < required)
  throw new Error("Global line and function coverage must remain at or above 85%");
