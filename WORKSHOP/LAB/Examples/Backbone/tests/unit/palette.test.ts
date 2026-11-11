import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import palette from "../../src/content/palette.json";

// FR-032(a): no authored color is green or red. FR-037: text contrast of at least 4.5 to 1.
// The bands and the "strongly colored" test are the spec's, not this file's.

const ROOT = join(import.meta.dirname, "../..");

export function hue(hex: string): { hue: number; strong: boolean } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const strong = d !== 0 && d / max >= 0.25 && max >= 0.2;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { hue: h * 60, strong };
}

const inGreen = (h: number): boolean => h >= 75 && h <= 165;
const inRed = (h: number): boolean => h < 25 || h > 340;

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|css|html|json|svg)$/.test(name)) out.push(path);
  }
  return out;
}

describe("authored colors (FR-032a, SC-007)", () => {
  const entries = Object.entries(palette as Record<string, string>);

  it("the palette holds six-digit hex colors only", () => {
    expect(entries.length).toBeGreaterThan(8);
    for (const [role, value] of entries) expect(value, role).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("no palette color is in the green band (75°–165°) or the red band (<25° or >340°)", () => {
    const bad: string[] = [];
    for (const [role, value] of entries) {
      const { hue: h, strong } = hue(value);
      if (strong && (inGreen(h) || inRed(h))) bad.push(`${role} ${value} hue ${Math.round(h)}`);
    }
    expect(bad).toEqual([]);
  });

  it("the check itself catches green and red", () => {
    for (const hex of ["#00c853", "#33ff66", "#7fff00"]) expect(inGreen(hue(hex).hue) && hue(hex).strong, hex).toBe(true);
    for (const hex of ["#ff0000", "#e53935", "#ff3355"]) expect(inRed(hue(hex).hue) && hue(hex).strong, hex).toBe(true);
    // Greys and near-blacks have no meaningful hue and are not judged.
    for (const hex of ["#808080", "#ffffff", "#050a18"]) expect(hue(hex).strong, hex).toBe(false);
  });

  it("no color literal is written outside palette.json", () => {
    const literal =
      /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|\bcolor\(\s*(?:srgb|display-p3)/g;
    const named =
      /:\s*[^;{}]*\b(red|green|lime|blue|navy|white|black|gr[ae]y|silver|yellow|orange|purple|pink|cyan|aqua|magenta|fuchsia|teal|olive|maroon|brown|gold|indigo|violet|crimson|coral|salmon|tomato|khaki)\b/gi;
    const found: string[] = [];
    const files = [...sourceFiles(join(ROOT, "src")), join(ROOT, "index.html")];
    for (const file of files) {
      const name = relative(ROOT, file);
      if (name === "src/content/palette.json" || name === "src/content/coast-na.json") continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.match(literal) ?? []) found.push(`${name}: ${match}`);
      if (name.endsWith(".css")) for (const match of text.match(named) ?? []) found.push(`${name}: ${match.trim()}`);
    }
    expect(found).toEqual([]);
  });
});

describe("text contrast (FR-037)", () => {
  it("every text color is at least 4.5 to 1 against every background it sits on", () => {
    const p = palette as Record<string, string>;
    const text = ["text", "textMuted", "focus", "congestion", "failure"];
    const backgrounds = ["background", "backgroundDeep", "panel"];
    const low: string[] = [];
    for (const t of text) {
      for (const b of backgrounds) {
        const ratio = contrast(p[t]!, p[b]!);
        if (ratio < 4.5) low.push(`${t} on ${b}: ${ratio.toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });
});
