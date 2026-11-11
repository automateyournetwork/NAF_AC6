// The reduced-motion setting and the URL switches. Both are outside input, so both are
// checked against fixed allowlists; anything else is ignored (SEC-11, SEC-12).

import { SEED_PATTERN } from "./scores";

export type MotionSetting = "auto" | "on" | "off";
export const SETTINGS_KEY = "backbone.settings.v1";

export interface Switches {
  seed: string | null;
  autostart: boolean;
  renderer: "gl" | "2d" | null;
  motion: "reduced" | "full" | null;
  bot: boolean;
  speed: number;
  hud: boolean;
  test: boolean;
}

const SPEEDS = new Set(["1", "2", "4", "8", "16"]);

export function parseSwitches(search: string): Switches {
  const params = new URLSearchParams(search);
  const one = (name: string): boolean => params.get(name) === "1";
  const seed = params.get("seed");
  const renderer = params.get("renderer");
  const motion = params.get("motion");
  const speed = params.get("speed");
  return {
    seed: seed !== null && SEED_PATTERN.test(seed) ? seed : null,
    autostart: one("autostart"),
    renderer: renderer === "gl" || renderer === "2d" ? renderer : null,
    motion: motion === "reduced" || motion === "full" ? motion : null,
    bot: one("bot"),
    speed: speed !== null && SPEEDS.has(speed) ? Number(speed) : 1,
    hud: params.get("hud") !== "0",
    test: one("test"),
  };
}

export function loadMotion(store: Pick<Storage, "getItem"> | null): MotionSetting {
  if (!store) return "auto";
  try {
    const raw: unknown = JSON.parse(store.getItem(SETTINGS_KEY) ?? "{}");
    const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).reducedMotion : undefined;
    return value === "on" || value === "off" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function saveMotion(store: Pick<Storage, "setItem"> | null, value: MotionSetting): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify({ reducedMotion: value }));
  } catch {
    // The device refused storage; the setting lasts for this visit only.
  }
}

/** Whether motion is reduced: a URL switch wins, then the player's setting, then the device. */
export function isMotionReduced(setting: MotionSetting, devicePrefers: boolean, override: Switches["motion"]): boolean {
  if (override) return override === "reduced";
  if (setting === "auto") return devicePrefers;
  return setting === "on";
}

/** A random seed: two short words and a number, all within the seed pattern. */
export function randomSeed(): string {
  const words = ["amber", "trunk", "metro", "relay", "fiber", "pulse", "ridge", "delta", "north", "coast", "mesa", "lake"];
  const pick = (): string => words[Math.floor(Math.random() * words.length)]!;
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}
