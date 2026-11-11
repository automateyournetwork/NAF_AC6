import { describe, expect, it } from "vitest";
import { beginStep, newDirection, offer, serve, utilization } from "../../src/sim/linkq";
import type { Packet } from "../../src/sim/types";
import { cases } from "./helpers";

const STEPS = 20;
let nextId = 1;
const packet = (): Packet => ({ id: nextId++, src: 1, dst: 2, born: 0, t0: 0, t1: 0 });

describe("one link direction (R4, R5)", () => {
  it("case 9: overload is exact to the packet, with service before arrival", () => {
    const c = cases.overload;
    const dir = newDirection(2 * STEPS);
    let offerCredit = 0;
    let offered = 0;
    let served = 0;
    let dropped = 0;
    const dropsBySecond = new Array<number>(c.seconds).fill(0);
    let queuedAt4s = -1;
    for (let step = 1; step <= c.seconds * STEPS; step++) {
      beginStep(dir, step);
      served += serve(dir, c.capacityPerSec, STEPS, step, 1);
      offerCredit += c.offeredPerSec;
      while (offerCredit >= STEPS) {
        offerCredit -= STEPS;
        offered++;
        if (!offer(dir, packet(), c.queueLen, step)) {
          dropped++;
          dropsBySecond[Math.ceil(step / STEPS) - 1]! += 1;
        }
      }
      if (step === 4 * STEPS) queuedAt4s = dir.queue.length;
    }
    expect({ offered, served, queued: dir.queue.length, dropped }).toEqual(c.expect);
    expect(offered).toBe(served + dir.queue.length + dropped);
    // "Queue grows 2/s and fills at 4 s; then 2/s drop for 6 s."
    expect(queuedAt4s).toBe(c.queueLen);
    expect(dropsBySecond).toEqual([0, 0, 0, 0, 2, 2, 2, 2, 2, 2]);
  });

  it("serves in arrival order", () => {
    const dir = newDirection(40);
    const first = packet();
    const second = packet();
    offer(dir, first, 8, 0);
    offer(dir, second, 8, 0);
    for (let step = 1; step <= 10; step++) {
      beginStep(dir, step);
      serve(dir, 4, STEPS, step, 3);
    }
    expect(dir.wire.map((p) => p.id)).toEqual([first.id, second.id]);
    expect(dir.wire[0]!.t1 - dir.wire[0]!.t0).toBe(3);
  });

  it("an idle direction keeps at most one packet of credit", () => {
    const dir = newDirection(40);
    for (let step = 1; step <= 200; step++) {
      beginStep(dir, step);
      serve(dir, 16, STEPS, step, 1);
    }
    expect(dir.credit).toBeLessThanOrEqual(STEPS);
    // A burst after a long idle spell still leaves at the configured rate.
    for (let i = 0; i < 8; i++) offer(dir, packet(), 8, 200);
    let served = 0;
    for (let step = 201; step <= 205; step++) {
      beginStep(dir, step);
      served += serve(dir, 16, STEPS, step, 1);
    }
    expect(served).toBeLessThanOrEqual(5);
  });

  it("reports utilization over the window and counts refusals", () => {
    const dir = newDirection(2 * STEPS);
    for (let step = 1; step <= 2 * STEPS; step++) {
      beginStep(dir, step);
      serve(dir, 4, STEPS, step, 1);
      if (step % 10 === 0) offer(dir, packet(), 8, step); // 2 per second offered to a capacity of 4
    }
    // Offered at steps 10, 20, 30 and 40; the first three have been served: 3 of the 8 the window allows.
    expect(utilization(dir, 4, STEPS)).toBeCloseTo(3 / 8, 10);
    expect(dir.refused.reduce((x, y) => x + y, 0)).toBe(0);
    for (let i = 0; i < 12; i++) offer(dir, packet(), 8, 2 * STEPS);
    expect(dir.refused.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
  });
});
