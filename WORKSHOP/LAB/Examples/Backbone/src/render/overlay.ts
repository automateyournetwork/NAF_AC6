// Labels, icons, patterns and markers, drawn the same way above either renderer. Every
// color state gets its second cue here (FR-033): congestion is patterned with a warning
// icon, failure is a broken line with a cut icon, a dark site carries a slashed icon.

import type { Palette } from "../content/load";
import { css } from "./color";
import type { Scene, SceneLink, SceneSite } from "./viewmodel";

export interface OverlayReport {
  labels: number;
  icons: number;
}

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

function label(ctx: CanvasRenderingContext2D, palette: Palette, text: string, x: number, y: number, size: number, color: string, dashed = false, weight = 500): void {
  ctx.font = `${weight} ${size}px ${MONO}`;
  const width = ctx.measureText(text).width;
  const padX = size * 0.35;
  const height = size * 1.35;
  ctx.fillStyle = css(palette.panel!, 0.82);
  ctx.fillRect(x - width / 2 - padX, y - height / 2, width + padX * 2, height);
  if (dashed) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = css(color, 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2 - padX, y - height / 2, width + padX * 2, height);
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + size * 0.05);
}

/** Warning triangle with an exclamation mark: congestion. */
function warningIcon(ctx: CanvasRenderingContext2D, palette: Palette, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.95, y + r * 0.75);
  ctx.lineTo(x - r * 0.95, y + r * 0.75);
  ctx.closePath();
  ctx.fillStyle = css(palette.background!, 0.95);
  ctx.fill();
  ctx.strokeStyle = palette.congestion!;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = palette.congestion!;
  ctx.fillRect(x - r * 0.08, y - r * 0.42, r * 0.16, r * 0.62);
  ctx.fillRect(x - r * 0.08, y + r * 0.34, r * 0.16, r * 0.16);
}

/** Small downward chevrons under the warning: packets are being dropped. */
function dropMark(ctx: CanvasRenderingContext2D, palette: Palette, x: number, y: number, r: number): void {
  ctx.strokeStyle = palette.congestion!;
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  ctx.lineCap = "round";
  for (const dy of [0, r * 0.55]) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y + dy);
    ctx.lineTo(x, y + dy + r * 0.45);
    ctx.lineTo(x + r * 0.5, y + dy);
    ctx.stroke();
  }
}

/** A disc with two snapped ends: the link is cut. */
function cutIcon(ctx: CanvasRenderingContext2D, palette: Palette, x: number, y: number, r: number, angle: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = css(palette.background!, 0.95);
  ctx.fill();
  ctx.strokeStyle = palette.failure!;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.lineTo(-r * 0.2, 0);
  ctx.lineTo(-r * 0.05, -r * 0.45);
  ctx.moveTo(r * 0.7, 0);
  ctx.lineTo(r * 0.2, 0);
  ctx.lineTo(r * 0.05, r * 0.45);
  ctx.stroke();
  ctx.restore();
}

/** A slash across a site: it has no path. */
function slashIcon(ctx: CanvasRenderingContext2D, palette: Palette, site: SceneSite, r: number): void {
  ctx.strokeStyle = palette.failure!;
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(site.x - r * 0.72, site.y + r * 0.72);
  ctx.lineTo(site.x + r * 0.72, site.y - r * 0.72);
  ctx.stroke();
}

function linkGeometry(link: SceneLink): { mx: number; my: number; ux: number; uy: number; nx: number; ny: number; length: number } {
  const dx = link.bx - link.ax;
  const dy = link.by - link.ay;
  const length = Math.hypot(dx, dy) || 1;
  return { mx: (link.ax + link.bx) / 2, my: (link.ay + link.by) / 2, ux: dx / length, uy: dy / length, nx: -dy / length, ny: dx / length, length };
}

/** Draws the overlay for a scene. Returns what it drew so two renderers can be compared. */
export function drawOverlay(ctx: CanvasRenderingContext2D, scene: Scene, palette: Palette, dpr: number): OverlayReport {
  const report: OverlayReport = { labels: 0, icons: 0 };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  const unit = scene.unit;
  // Map text is one unit tall, like the smallest text on the page (FR-037).
  const small = unit;
  const icons: (() => void)[] = [];

  for (const link of scene.links) {
    const g = linkGeometry(link);
    const edge = link.width / 2;

    // Capacity tier: thin rails beside the link, one pair per tier above the first.
    const tier = link.pendingTier ?? link.tier;
    ctx.strokeStyle = css(link.look === "cut" ? palette.failure! : palette.pulse!, link.pending === "remove" ? 0.2 : 0.55);
    ctx.lineWidth = 1;
    if (link.pendingTier !== null) ctx.setLineDash([4, 4]);
    for (let rail = 1; rail <= tier; rail++) {
      const off = edge + 2.5 * rail * link.s + 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(link.ax + g.nx * off * side, link.ay + g.ny * off * side);
        ctx.lineTo(link.bx + g.nx * off * side, link.by + g.ny * off * side);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Congestion pattern: dark stripes across the amber line.
    if (link.look === "congested" || link.look === "dropping") {
      ctx.strokeStyle = css(palette.background!, 0.85);
      ctx.lineWidth = Math.max(2, link.width * 0.55);
      ctx.setLineDash([3 * link.s, 6 * link.s]);
      ctx.beginPath();
      ctx.moveTo(link.ax, link.ay);
      ctx.lineTo(link.bx, link.by);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Queued packets, stacked at the sending end of each direction.
    const square = 3.4 * link.s;
    const stack = (count: number, fromX: number, fromY: number, dir: 1 | -1): void => {
      for (let i = 0; i < count; i++) {
        const along = (13 + i * 4.6) * link.s;
        if (along > g.length * 0.45) break;
        const x = fromX + g.ux * along * dir + g.nx * (edge + 4.5 * link.s) * dir;
        const y = fromY + g.uy * along * dir + g.ny * (edge + 4.5 * link.s) * dir;
        ctx.fillStyle = css(count >= scene.queueLen ? palette.congestion! : palette.pulse!, 0.9);
        ctx.fillRect(x - square / 2, y - square / 2, square, square);
      }
    };
    stack(link.queueAB, link.ax, link.ay, 1);
    stack(link.queueBA, link.bx, link.by, -1);

    // Cost label, always visible. A pending cost is shown beside the cost in force.
    const lx = g.mx + g.nx * (edge + small * 1.1);
    const ly = g.my + g.ny * (edge + small * 1.1);
    const text = link.pendingCost !== null ? `${link.cost}→${link.pendingCost}` : String(link.cost);
    const color = link.look === "cut" ? palette.failure! : link.look === "congested" || link.look === "dropping" ? palette.congestion! : palette.text!;
    label(ctx, palette, text, lx, ly, small, link.pending === "remove" ? palette.textMuted! : color, link.pendingCost !== null || link.pending !== null);
    report.labels++;

    // Utilization numbers on the map while paused (FR-030).
    if (scene.paused && link.pending !== "new" && link.look !== "cut") {
      const percent = `${Math.round(Math.max(link.utilAB, link.utilBA) * 100)}%`;
      label(ctx, palette, percent, g.mx - g.nx * (edge + small * 1.1), g.my - g.ny * (edge + small * 1.1), small, palette.textMuted!);
      report.labels++;
    }

    // Icons sit a little off the line, away from the cost label, and are drawn last so that
    // no label can cover them.
    const iconR = Math.max(8, unit * 0.62) * Math.min(1.15, link.s);
    const along = g.length * 0.14;
    const ix = g.mx - g.ux * along - g.nx * (edge + iconR * 1.5);
    const iy = g.my - g.uy * along - g.ny * (edge + iconR * 1.5);
    if (link.look === "congested" || link.look === "dropping") {
      icons.push(() => warningIcon(ctx, palette, ix, iy, iconR));
      if (link.look === "dropping") icons.push(() => dropMark(ctx, palette, ix + iconR * 1.9, iy - iconR * 0.35, iconR * 0.75));
    } else if (link.look === "cut") {
      icons.push(() => cutIcon(ctx, palette, g.mx, g.my, iconR, Math.atan2(g.uy, g.ux)));
    }

    if (link.focused) {
      ctx.strokeStyle = palette.text!;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const off = edge + 9;
      ctx.beginPath();
      ctx.moveTo(link.ax + g.nx * off, link.ay + g.ny * off);
      ctx.lineTo(link.bx + g.nx * off, link.by + g.ny * off);
      ctx.lineTo(link.bx - g.nx * off, link.by - g.ny * off);
      ctx.lineTo(link.ax - g.nx * off, link.ay - g.ny * off);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const site of scene.sites) {
    const r = 9 * site.s;
    if (site.state === "dark") icons.push(() => slashIcon(ctx, palette, site, r * 1.5));
    if (site.focused || site.armed) {
      ctx.strokeStyle = palette.text!;
      ctx.lineWidth = 2;
      if (site.focused) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(site.x, site.y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const color = site.state === "dark" ? palette.failure! : palette.text!;
    label(ctx, palette, site.code, site.x, site.y + r + small * 1.2, small * 1.2, color);
    report.labels++;
    if (site.state === "new") {
      label(ctx, palette, "NEW", site.x, site.y - r - small * 1.05, small, palette.linkBright!);
      report.labels++;
    }
  }

  for (const draw of icons) draw();
  report.icons = icons.length;

  if (scene.drag) {
    const { bx, by, km, affordable } = scene.drag;
    const text = `${km.toLocaleString("en-US")} km${affordable ? "" : " · not enough fiber"}`;
    label(ctx, palette, text, bx, by - small * 2.2, small, affordable ? palette.text! : palette.congestion!);
    report.labels++;
  }
  return report;
}
