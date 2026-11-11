// One direction of a link (R4, R5): a first-in-first-out queue served at a fixed rate,
// the wire the served packets travel on, and counts for the utilization window.

import type { Direction, Packet } from "./types";

export function newDirection(windowSteps: number): Direction {
  return {
    queue: [],
    wire: [],
    credit: 0,
    served: new Array<number>(windowSteps).fill(0),
    refused: new Array<number>(windowSteps).fill(0),
  };
}

/** Opens this step's slot in the utilization window. Call once per step, before serving. */
export function beginStep(dir: Direction, step: number): void {
  const slot = step % dir.served.length;
  dir.served[slot] = 0;
  dir.refused[slot] = 0;
}

/**
 * Serves from the queue onto the wire. The credit grows by the capacity each step and one
 * packet costs `stepsPerSec` of it, so `capacity` packets leave per second, exactly.
 * An idle direction keeps at most one packet of credit, so it cannot release a burst later.
 */
export function serve(dir: Direction, capacity: number, stepsPerSec: number, step: number, travelSteps: number): number {
  dir.credit += capacity;
  let served = 0;
  while (dir.credit >= stepsPerSec && dir.queue.length > 0) {
    const packet = dir.queue.shift()!;
    packet.t0 = step;
    packet.t1 = step + travelSteps;
    dir.wire.push(packet);
    dir.credit -= stepsPerSec;
    served++;
  }
  if (dir.queue.length === 0 && dir.credit > stepsPerSec) dir.credit = stepsPerSec;
  dir.served[step % dir.served.length]! += served;
  return served;
}

/** Accepts a packet into the queue, or refuses it when the queue is full. */
export function offer(dir: Direction, packet: Packet, queueLen: number, step: number): boolean {
  if (dir.queue.length >= queueLen) {
    dir.refused[step % dir.refused.length]! += 1;
    return false;
  }
  dir.queue.push(packet);
  return true;
}

/** Packets served in the window divided by what the capacity allows in the window. */
export function utilization(dir: Direction, capacity: number, stepsPerSec: number): number {
  let served = 0;
  for (const n of dir.served) served += n;
  return (served * stepsPerSec) / (capacity * dir.served.length);
}

/** Packets refused in the window. */
export function refusedInWindow(dir: Direction): number {
  let refused = 0;
  for (const n of dir.refused) refused += n;
  return refused;
}
