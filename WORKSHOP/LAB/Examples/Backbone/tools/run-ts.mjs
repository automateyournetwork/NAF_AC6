// Runs one of the project's TypeScript tools through the pinned Vite, so no extra runner
// has to be installed:  node tools/run-ts.mjs tools/bot-runs.ts [args…]

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [file, ...args] = process.argv.slice(2);
if (!file) {
  console.error("usage: node tools/run-ts.mjs <file.ts> [args…]");
  process.exit(2);
}
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
try {
  const module = await server.ssrLoadModule(`/${file}`);
  await module.main(args);
} finally {
  await server.close();
}
