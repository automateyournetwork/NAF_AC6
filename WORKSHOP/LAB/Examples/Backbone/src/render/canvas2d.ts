// The fallback renderer: draws the shared scene with the Canvas 2D API. It is used when
// WebGL2 is not available (AC20, FR-035), and it is the first renderer the game was built on.

import type { Palette } from "../content/load";
import { css, rgb01 } from "./color";
import type { DrawReport, Scene, SceneLink } from "./viewmodel";

export interface Renderer {
  readonly name: "2d" | "gl";
  /** True once the renderer can no longer draw (a lost WebGL context). */
  readonly failed?: boolean;
  resize(width: number, height: number, dpr: number): void;
  draw(scene: Scene): Pick<DrawReport, "links" | "pulses" | "sites" | "effects">;
}

/** Mixes two palette colors. Used for load: a link brightens from `link` toward `linkBright`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb01(a);
  const [br, bg, bb] = rgb01(b);
  const part = (x: number, y: number): string =>
    Math.round((x + (y - x) * t) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(ar, br)}${part(ag, bg)}${part(ab, bb)}`;
}

/** The color of a link for its state. A state color replaces the normal color; it is never added to it. */
export function linkColor(link: SceneLink, palette: Palette): string {
  if (link.look === "cut") return palette.failure!;
  if (link.look === "congested" || link.look === "dropping") return palette.congestion!;
  // A loaded link brightens toward white, never toward cyan: cyan light next to an amber
  // link blends into the green band, and white next to anything keeps that thing's hue.
  if (link.pending === "new") return palette.pulse!;
  return mix(palette.link!, palette.pulse!, Math.min(1, link.load) * 0.7);
}

/**
 * The still part of the map: background, land, lakes, grid and coastline. Both renderers
 * use this one routine; the WebGL renderer draws it into a texture.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, scene: Scene, p: Palette): void {
  const path = (points: number[]): void => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i]!, points[i + 1]!);
      else ctx.lineTo(points[i]!, points[i + 1]!);
    }
  };
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.fillStyle = p.background!;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.fillStyle = p.land!;
  for (const ring of scene.land) {
    path(ring);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = p.background!;
  for (const ring of scene.lakes) {
    path(ring);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = css(p.grid!, 0.38);
  ctx.lineWidth = 1;
  for (const line of scene.grid) {
    path(line);
    ctx.stroke();
  }
  ctx.strokeStyle = css(p.coast!, 0.75);
  ctx.lineWidth = 1.2;
  for (const ring of [...scene.land, ...scene.lakes]) {
    path(ring);
    ctx.closePath();
    ctx.stroke();
  }
}

export class Canvas2dRenderer implements Renderer {
  readonly name = "2d" as const;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly palette: Palette,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the map.");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  private path(points: number[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i]!, points[i + 1]!);
      else ctx.lineTo(points[i]!, points[i + 1]!);
    }
  }

  draw(scene: Scene): Pick<DrawReport, "links" | "pulses" | "sites" | "effects"> {
    const ctx = this.ctx;
    const p = this.palette;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    drawBackdrop(ctx, scene, p);

    // The scanning sweep: a soft band that crosses the map.
    if (scene.sweep !== null) {
      const x = scene.sweep * (scene.width + 300) - 150;
      const band = ctx.createLinearGradient(x - 150, 0, x, 0);
      band.addColorStop(0, css(p.linkBright!, 0));
      band.addColorStop(1, css(p.linkBright!, 0.09));
      ctx.fillStyle = band;
      ctx.fillRect(x - 150, 0, 150, scene.height);
    }

    // Links: a soft halo, then the line itself. Brighter and thicker with load.
    for (const link of scene.links) {
      const color = linkColor(link, p);
      const faded = link.pending === "remove" ? 0.3 : 1;
      const segments: number[][] = [];
      if (link.look === "cut") {
        // A broken line: the middle is missing.
        const gap = 0.07;
        const mx = (t: number): number => link.ax + (link.bx - link.ax) * t;
        const my = (t: number): number => link.ay + (link.by - link.ay) * t;
        segments.push([link.ax, link.ay, mx(0.5 - gap), my(0.5 - gap)], [mx(0.5 + gap), my(0.5 + gap), link.bx, link.by]);
      } else {
        segments.push([link.ax, link.ay, link.bx, link.by]);
      }
      if (link.look === "cut") ctx.setLineDash([9 * link.s, 7 * link.s]);
      else if (link.pending === "new") ctx.setLineDash([7 * link.s, 6 * link.s]);
      for (const segment of segments) {
        this.path(segment);
        // A cut link is dark: it has no halo. That also keeps magenta light from mixing
        // with the amber of a congested link beside it, which would land in the red band.
        if (link.look !== "cut") {
          ctx.strokeStyle = css(color, 0.16 * link.glow * faded);
          ctx.lineWidth = link.width * 3.6;
          ctx.stroke();
        }
        ctx.strokeStyle = css(color, (0.55 + 0.45 * link.glow) * faded);
        ctx.lineWidth = link.width;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Pulses: one per simulated packet, with a trail unless motion is reduced.
    for (const pulse of scene.pulses) {
      if (pulse.tx !== pulse.x || pulse.ty !== pulse.y) {
        const trail = ctx.createLinearGradient(pulse.tx, pulse.ty, pulse.x, pulse.y);
        trail.addColorStop(0, css(p.pulse!, 0));
        trail.addColorStop(1, css(p.pulse!, 0.55));
        ctx.strokeStyle = trail;
        ctx.lineWidth = 1.8 * pulse.s;
        ctx.beginPath();
        ctx.moveTo(pulse.tx, pulse.ty);
        ctx.lineTo(pulse.x, pulse.y);
        ctx.stroke();
      }
      ctx.fillStyle = css(p.pulse!, 0.22);
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 5 * pulse.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.pulse!;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 2.3 * pulse.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sites.
    for (const site of scene.sites) {
      const r = 9 * site.s;
      const ring = site.state === "dark" ? p.failure! : p.site!;
      ctx.fillStyle = p.background!;
      ctx.beginPath();
      ctx.arc(site.x, site.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (site.state !== "dark") {
        ctx.fillStyle = css(p.link!, 0.2);
        ctx.beginPath();
        ctx.arc(site.x, site.y, r * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2 * site.s;
      if (site.state === "new") ctx.setLineDash([4 * site.s, 3.5 * site.s]);
      ctx.beginPath();
      ctx.arc(site.x, site.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (site.state === "active") {
        ctx.fillStyle = p.pulse!;
        ctx.beginPath();
        ctx.arc(site.x, site.y, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The cut spark and the reconvergence ripple. With reduced motion they stand still.
    for (const effect of scene.effects) {
      const fade = 1 - effect.age;
      if (effect.kind === "spark") {
        const reach = (scene.reducedMotion ? 26 : 12 + 40 * effect.age) * 1;
        ctx.strokeStyle = css(p.failure!, 0.95 * fade);
        ctx.lineWidth = 2.2;
        for (let ray = 0; ray < 10; ray++) {
          const angle = (ray / 10) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * reach * 0.35, effect.y + Math.sin(angle) * reach * 0.35);
          ctx.lineTo(effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach);
          ctx.stroke();
        }
        ctx.fillStyle = css(p.pulse!, 0.8 * fade);
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 5 * fade + 1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const radius = scene.reducedMotion ? 70 : 30 + effect.age * Math.max(scene.width, scene.height) * 0.45;
        // The ripple is ice white, not magenta: it crosses every link on the map, and white
        // light over amber or blue keeps their hue.
        ctx.strokeStyle = css(p.pulse!, 0.6 * fade);
        ctx.lineWidth = 1 + 3 * fade;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // A link being dragged out from a site.
    if (scene.drag) {
      ctx.strokeStyle = css(scene.drag.affordable ? p.pulse! : p.congestion!, 0.9);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(scene.drag.ax, scene.drag.ay);
      ctx.lineTo(scene.drag.bx, scene.drag.by);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    return { links: scene.links.length, pulses: scene.pulses.length, sites: scene.sites.length, effects: scene.effects.length };
  }
}
