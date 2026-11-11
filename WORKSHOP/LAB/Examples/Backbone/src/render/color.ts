// Colors come from src/content/palette.json and nowhere else. These helpers turn a
// palette entry into the forms the renderers need; they never hold a color themselves.

export type Rgb = [number, number, number];

/** "#rrggbb" to three numbers from 0 to 1. */
export function rgb01(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

/** A CSS color string for a palette entry at the given opacity. */
export function css(hex: string, alpha = 1): string {
  const [r, g, b] = rgb01(hex).map((c) => Math.round(c * 255));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
