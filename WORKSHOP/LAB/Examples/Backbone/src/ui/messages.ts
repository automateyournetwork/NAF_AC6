// Text messages. Every refusal and every event is said in words, never by color or motion
// alone (FR-040). The container is a polite live region, so assistive technology reads them.

import { el } from "./dom";

export type Tone = "info" | "warn" | "fail";

const KEEP = 3;
const SHOW_MS = 6000;

export function say(message: string, tone: Tone = "info"): void {
  const box = el("messages");
  const line = document.createElement("div");
  line.className = tone === "info" ? "message" : `message ${tone}`;
  line.textContent = message;
  box.append(line);
  while (box.children.length > KEEP) box.firstElementChild?.remove();
  window.setTimeout(() => line.remove(), SHOW_MS);
}

export function clearMessages(): void {
  el("messages").replaceChildren();
}
