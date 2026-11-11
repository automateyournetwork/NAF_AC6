// Checks that the committed dist/ is exactly what the source builds (plan decision D1).
//
//   npm run verify:dist
//
// Builds into a temporary folder and compares every file with dist/ by SHA-256. Exits with
// an error if a file differs, is missing or is extra.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const committed = join(root, "dist");
const fresh = mkdtempSync(join(tmpdir(), "backbone-dist-"));

function files(dir, base = dir) {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) for (const [k, v] of files(path, base)) out.set(k, v);
    else out.set(relative(base, path), createHash("sha256").update(readFileSync(path)).digest("hex"));
  }
  return out;
}

try {
  const build = spawnSync("npx", ["vite", "build", "--outDir", fresh, "--emptyOutDir", "--logLevel", "error"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) throw new Error("the build failed");
  const want = files(fresh);
  const have = files(committed);
  const problems = [];
  for (const [name, hash] of want) {
    if (!have.has(name)) problems.push(`missing from dist/: ${name}`);
    else if (have.get(name) !== hash) problems.push(`differs from a fresh build: ${name}`);
  }
  for (const name of have.keys()) if (!want.has(name)) problems.push(`in dist/ but not in a fresh build: ${name}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`dist/ does not match the source (${problems.length} problem${problems.length === 1 ? "" : "s"}). Run npm run build and commit dist/.`);
    process.exitCode = 1;
  } else {
    console.log(`dist/ matches a fresh build: ${want.size} files.`);
  }
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
