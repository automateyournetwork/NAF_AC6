// Pointer, touch and keyboard input on the map (AC15, AC16, AC17). Nothing here has a time
// limit, and every target is at least 44 CSS pixels across (C3, FR-029).

import { HIT_RADIUS, distanceToSegment, type Camera } from "../render/camera";
import type { Scene, SceneLink, SceneSite } from "../render/viewmodel";
import type { LinkId, SiteId } from "../sim/types";
import type { Game, Tool } from "./game";

export interface InputHooks {
  game(): Game | null;
  scene(): Scene | null;
  camera: Camera;
  layLink(a: SiteId, b: SiteId): void;
  siteChosen(id: SiteId): void;
  openLink(id: LinkId): void;
  togglePause(): void;
  toggleInspector(): void;
  setTool(tool: Tool): void;
  escape(): void;
  moved(): void;
}

export function siteAt(scene: Scene, x: number, y: number): SceneSite | null {
  let best: SceneSite | null = null;
  let bestDistance = Infinity;
  for (const site of scene.sites) {
    const d = Math.hypot(site.x - x, site.y - y);
    if (d <= Math.max(HIT_RADIUS, 9 * site.s + 8) && d < bestDistance) {
      best = site;
      bestDistance = d;
    }
  }
  return best;
}

export function linkAt(scene: Scene, x: number, y: number): SceneLink | null {
  let best: SceneLink | null = null;
  let bestDistance = Infinity;
  for (const link of scene.links) {
    const d = distanceToSegment(x, y, link.ax, link.ay, link.bx, link.by);
    if (d <= HIT_RADIUS && d < bestDistance) {
      best = link;
      bestDistance = d;
    }
  }
  return best;
}

const TOOLS: Record<string, Tool> = { "1": "link", "2": "cost", "3": "upgrade", "4": "remove" };

export function attachInput(canvas: HTMLCanvasElement, hooks: InputHooks): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: "idle" | "link" | "tap-link" | "pan" | "pinch" = "idle";
  let startX = 0;
  let startY = 0;
  let moved = false;
  let fromSite: SiteId = 0;
  let tapLink: LinkId = 0;
  /** A link that was tapped and waits for the browser's click before its panel opens. */
  let tapped: LinkId = 0;
  let pinch = { distance: 1, x: 0, y: 0 };
  /** The map point a drag or a pinch is holding. */
  let held = { x: 0, y: 0 };

  const position = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const pinchState = (): { distance: number; x: number; y: number } => {
    const [p, q] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { distance: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };

  canvas.addEventListener("pointerdown", (event) => {
    const game = hooks.game();
    const scene = hooks.scene();
    if (!game || !scene || game.world.over) return;
    const at = position(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, at);
    if (pointers.size === 2) {
      // A second finger turns whatever was happening into pinch and pan.
      game.drag = null;
      mode = "pinch";
      pinch = pinchState();
      held = hooks.camera.toMap(pinch.x, pinch.y);
      return;
    }
    if (pointers.size > 2) return;
    startX = at.x;
    startY = at.y;
    moved = false;
    const site = siteAt(scene, at.x, at.y);
    const link = site ? null : linkAt(scene, at.x, at.y);
    if (site) {
      mode = "link";
      fromSite = site.id;
      game.drag = { from: site.id, x: at.x, y: at.y };
    } else if (link) {
      mode = "tap-link";
      tapLink = link.id;
    } else {
      mode = "pan";
      held = hooks.camera.toMap(at.x, at.y);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const game = hooks.game();
    const previous = pointers.get(event.pointerId);
    if (!game || !previous) return;
    const at = position(event);
    pointers.set(event.pointerId, at);
    if (mode === "pinch" && pointers.size >= 2) {
      // The map point between the fingers stays between the fingers while they spread or move.
      const now = pinchState();
      hooks.camera.zoomAt(now.distance / pinch.distance, now.x, now.y);
      hooks.camera.pin(held, now.x, now.y);
      pinch = now;
      hooks.moved();
      return;
    }
    if (Math.hypot(at.x - startX, at.y - startY) > 8) moved = true;
    if (mode === "link" && game.drag) {
      game.drag.x = at.x;
      game.drag.y = at.y;
    } else if (mode === "tap-link" && moved) {
      mode = "pan";
      held = hooks.camera.toMap(previous.x, previous.y);
    } else if (mode === "pan") {
      hooks.camera.pin(held, at.x, at.y);
      hooks.moved();
    }
  });

  const release = (event: PointerEvent, cancelled: boolean): void => {
    const game = hooks.game();
    const scene = hooks.scene();
    const at = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!game || !at) return;
    if (mode === "pinch") {
      if (pointers.size < 2) mode = "idle";
      return;
    }
    if (mode === "link") {
      game.drag = null;
      const target = !cancelled && scene ? siteAt(scene, at.x, at.y) : null;
      // Dragging away and back to the same site asks for a self-link, which the rules refuse in words.
      if (target && (target.id !== fromSite || moved)) hooks.layLink(fromSite, target.id);
      else if (!cancelled && !moved) hooks.siteChosen(fromSite);
    } else if (mode === "tap-link" && !cancelled && !moved) {
      // The options panel opens under the finger. If it opened now, the click that the
      // browser sends after a touch would land on one of its buttons. So it opens on that
      // click instead, with a short timer in case the browser sends none.
      const id = tapLink;
      tapped = id;
      window.setTimeout(() => {
        if (tapped === id) {
          tapped = 0;
          hooks.openLink(id);
        }
      }, 350);
    }
    mode = "idle";
  };
  canvas.addEventListener("pointerup", (event) => release(event, false));
  canvas.addEventListener("pointercancel", (event) => release(event, true));
  canvas.addEventListener("click", () => {
    if (tapped === 0) return;
    const id = tapped;
    tapped = 0;
    hooks.openLink(id);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!hooks.game()) return;
      event.preventDefault();
      const at = position(event);
      hooks.camera.zoomAt(Math.exp(-event.deltaY * 0.0015), at.x, at.y);
      hooks.moved();
    },
    { passive: false },
  );

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") {
      hooks.escape();
      return;
    }
    const game = hooks.game();
    const target = event.target;
    if (!game || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    const camera = hooks.camera;
    const onControl = target instanceof HTMLButtonElement;
    const tool = TOOLS[event.key];
    if (tool) {
      hooks.setTool(tool);
    } else if (event.key === " ") {
      // On a button, Space presses that button, as it does everywhere else.
      if (onControl) return;
      event.preventDefault();
      hooks.togglePause();
    } else if (event.key === "i" || event.key === "I") {
      hooks.toggleInspector();
    } else if (event.key === "+" || event.key === "=") {
      camera.zoomAt(1.25, camera.width / 2, camera.height / 2);
      hooks.moved();
    } else if (event.key === "-" || event.key === "_") {
      camera.zoomAt(0.8, camera.width / 2, camera.height / 2);
      hooks.moved();
    } else if (event.key.startsWith("Arrow") && (target === canvas || target === document.body)) {
      event.preventDefault();
      const stride = 60;
      camera.panBy(event.key === "ArrowLeft" ? stride : event.key === "ArrowRight" ? -stride : 0, event.key === "ArrowUp" ? stride : event.key === "ArrowDown" ? -stride : 0);
      hooks.moved();
    }
  });
}
