// Serves dist/ on 127.0.0.1 for the capture tools (the hero art, the videos),
// and makes sure that what answers is this build.
//
// The tools used to pick a random port, wait a fixed 700 ms and hope. If the port was
// already in use, the browser loaded whatever was listening there, and evidence could be
// captured from the wrong content. Here the system hands out a free port, the tool waits
// until the server answers, and the answer must be this build's index.html, byte for byte.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const READY_MS = 15_000;

/** Asks the system for a port that nothing is listening on. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts a file server for dist/ and returns `{ url, stop }` once it serves this build.
 * `url` ends with a slash. Throws if the server exits, does not answer in time, or if what
 * answers is not this build's index.html.
 */
export async function serveDist() {
  const dist = join(root, "dist");
  const index = readFileSync(join(dist, "index.html"), "utf8");
  const port = await freePort();
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", dist], { stdio: "ignore" });
  let exit = null;
  server.once("exit", (code, signal) => {
    exit = code ?? signal ?? "unknown";
  });
  server.once("error", (error) => {
    exit = error.message;
  });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + READY_MS;
  for (;;) {
    if (exit !== null) throw new Error(`the file server for dist/ stopped (${exit}) before it answered on port ${port}`);
    let body = null;
    try {
      // A port that accepts the connection and never answers must not outlast the deadline.
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) body = await response.text();
    } catch {
      // Not listening yet, or no answer in time.
    }
    if (body !== null) {
      // The server this tool started must be the one that answered, and with this build.
      if (exit !== null || body !== index) {
        server.kill();
        throw new Error(`port ${port} answered with something other than this build's dist/index.html`);
      }
      return { url, stop: () => server.kill() };
    }
    if (Date.now() > deadline) {
      server.kill();
      throw new Error(`the file server for dist/ did not answer on port ${port} within ${READY_MS / 1000} s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
