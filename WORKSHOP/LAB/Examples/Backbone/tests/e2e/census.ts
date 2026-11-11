// Decodes a screenshot and counts the strongly colored pixels that fall in the green and red
// hue bands of FR-032. It runs in Node, outside the page, so the game is not asked to
// measure itself, and a screenshot covers the page's text and controls as well as the map.

import { inflateSync } from "node:zlib";

export interface Census {
  pixels: number;
  /** Pixels with a meaningful hue: saturation at least 0.25 and brightness at least 0.2. */
  colored: number;
  green: number;
  red: number;
  /** Shares of the strongly colored pixels, 0 to 1. */
  greenShare: number;
  redShare: number;
}

interface Image {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG, which is what the browser writes. */
export function decodePng(file: Buffer): Image {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const color = body[9];
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0) throw new Error("unsupported PNG format");
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      parts.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const value = raw[line + x]!;
      const left = x >= channels ? data[y * stride + x - channels]! : 0;
      const up = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? data[(y - 1) * stride + x - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      data[y * stride + x] = (value + predicted) & 255;
    }
  }
  return { width, height, channels, data };
}

/** The census of FR-032(b). Green is hue 75° to 165°. Red is hue below 25° or above 340°. */
export function census(png: Buffer): Census {
  const image = decodePng(png);
  let colored = 0;
  let green = 0;
  let red = 0;
  const { data, channels } = image;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0 || d / max < 0.25 || max < 0.2) continue;
    colored++;
    const hue = (max === r ? ((((g - b) / d) % 6) + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    if (hue >= 75 && hue <= 165) green++;
    else if (hue < 25 || hue > 340) red++;
  }
  const pixels = image.width * image.height;
  return { pixels, colored, green, red, greenShare: colored === 0 ? 0 : green / colored, redShare: colored === 0 ? 0 : red / colored };
}
