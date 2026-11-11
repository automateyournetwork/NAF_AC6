// The game's content, validated once at start-up.

import type { Region, Tuning } from "../sim/types";
import coastJson from "./coast-na.json";
import { projectCoast, validatePalette, validateRegion, validateText, validateTuning, type Coast, type Palette, type Text } from "./load";
import paletteJson from "./palette.json";
import regionJson from "./region-na.json";
import textJson from "./text.json";
import tuningJson from "./tuning.json";

export interface Content {
  tuning: Tuning;
  region: Region;
  coast: Coast;
  palette: Palette;
  text: Text;
}

export function loadContent(): Content {
  const tuning = validateTuning(tuningJson);
  const region = validateRegion(regionJson, tuning.maxSites);
  return {
    tuning,
    region,
    coast: projectCoast(coastJson, region.lon0, region.lat0),
    palette: validatePalette(paletteJson),
    text: validateText(textJson),
  };
}
