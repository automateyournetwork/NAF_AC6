// Small helpers for the page. All dynamic text reaches the page through textContent,
// never through markup (SEC-14).

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`The page is missing #${id}.`);
  return found as T;
}

export function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

export function show(node: HTMLElement, visible: boolean): void {
  if (node.hidden === visible) node.hidden = !visible;
}

export const num = (n: number): string => n.toLocaleString("en-US");
export const km = (n: number): string => `${num(n)} km`;
export const percent = (fraction: number): string => `${Math.round(Math.min(1, fraction) * 100)}%`;

/** Fills {name} places in a sentence from text.json. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}
