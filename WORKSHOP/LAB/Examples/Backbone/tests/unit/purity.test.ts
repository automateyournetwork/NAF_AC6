import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// C5: simulation modules use nothing from the DOM, the renderer, the clock or Math.random.
// An import check alone cannot see globals, so this scans for both (plan P2).

const SIM = join(import.meta.dirname, "../../src/sim");
const FORBIDDEN = [
  "document",
  "window",
  "navigator",
  "Date",
  "performance",
  "Math.random",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "crypto",
  "localStorage",
  "fetch",
];

/** Removes comments so that a word in a comment is not mistaken for code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("the simulation is pure (C5)", () => {
  const files = readdirSync(SIM).filter((name) => name.endsWith(".ts"));

  it("has the files the plan names", () => {
    expect(files.sort()).toEqual(["bot.ts", "forwarding.ts", "linkq.ts", "replay.ts", "rng.ts", "spf.ts", "types.ts", "world.ts"]);
  });

  it("imports only from src/sim", () => {
    const outside: string[] = [];
    for (const name of files) {
      const text = code(readFileSync(join(SIM, name), "utf8"));
      for (const match of text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
        const target = match[1] ?? match[2]!;
        if (!/^\.\/[a-z]+$/.test(target)) outside.push(`${name}: ${target}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("uses no DOM, clock, random or timer global", () => {
    const found: string[] = [];
    for (const name of files) {
      const text = code(readFileSync(join(SIM, name), "utf8"));
      for (const word of FORBIDDEN) {
        const pattern = new RegExp(`(?<![\\w.$])${word.replace(".", "\\.")}(?![\\w$])`);
        if (pattern.test(text)) found.push(`${name}: ${word}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the scan itself catches what it forbids", () => {
    const sample = code('const t = Date.now(); // fine\nconst r = Math.random();\nimport x from "../ui/hud";');
    expect(/(?<![\w.$])Date(?![\w$])/.test(sample)).toBe(true);
    expect(/(?<![\w.$])Math\.random(?![\w$])/.test(sample)).toBe(true);
    expect(/(?<![\w.$])Date(?![\w$])/.test(code("// Date in a comment only\nconst updated = 1;"))).toBe(false);
  });
});
