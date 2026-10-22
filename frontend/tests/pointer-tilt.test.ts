import assert from "node:assert/strict";
import test from "node:test";
import { createPointerTilt } from "../lib/pointer-tilt";

function fixture() {
  const surface = { style: { transform: "", transition: "transform 1s" } };
  const queue = new Map<number, (time: number) => void>();
  let serial = 0, now = 0, reads = 0;
  const controller = createPointerTilt(surface, () => {
    reads += 1;
    return { left: 10, top: 20, width: 100, height: 100 };
  }, { request(callback) { const id = ++serial; queue.set(id, callback); return id; },
    cancel(id) { queue.delete(id); } });
  const frame = () => {
    now += 1000 / 60;
    const callbacks = [...queue.values()];
    queue.clear();
    callbacks.forEach(callback => callback(now));
  };
  const angles = () => [...surface.style.transform.matchAll(/rotate[XY]\((-?[\d.]+)deg\)/g)].map(v => Number(v[1]));
  return { controller, surface, queue, frame, angles, reads: () => reads };
}

test("pointer micro-events batch to one write using one stable bounds read", () => {
  const f = fixture();
  f.controller.enter(true);
  for (let i = 0; i < 100; i += 1) f.controller.move(110, 120);
  assert.equal(f.reads(), 1);
  assert.equal(f.queue.size, 1);
  assert.equal(f.surface.style.transform, "");
  f.frame();
  assert.deepEqual(f.angles(), [-0.54, 0.54]);
  assert.equal(f.surface.style.transition, "none");
  for (let i = 0; i < 100; i += 1) f.frame();
  assert(f.angles().every(angle => Math.abs(angle) <= 3));
  f.controller.move(10000, -10000);
  for (let i = 0; i < 100; i += 1) f.frame();
  assert(f.angles().every(angle => Math.abs(angle) <= 3));
});

test("pointer exit returns through the shared spring and stops scheduling", () => {
  const f = fixture();
  f.controller.enter(true);
  f.controller.move(110, 120);
  for (let i = 0; i < 40; i += 1) f.frame();
  f.controller.leave();
  for (let i = 0; i < 300; i += 1) f.frame();
  assert.deepEqual(f.angles(), [0, 0]);
  assert.equal(f.queue.size, 0);
});

test("focus/reduced/coarse/drag suppression and teardown cancel pending writes", () => {
  const f = fixture();
  f.controller.enter(false);
  f.controller.move(110, 120);
  assert.equal(f.reads(), 0);
  assert.equal(f.queue.size, 0);
  f.controller.enter(true);
  f.controller.move(110, 120);
  f.controller.flatten();
  assert.equal(f.queue.size, 0);
  assert.deepEqual(f.angles(), [0, 0]);
  f.controller.move(110, 120);
  assert.equal(f.queue.size, 0);
  f.controller.enter(true);
  f.controller.move(110, 120);
  f.controller.dispose();
  f.controller.enter(true);
  f.controller.move(110, 120);
  assert.equal(f.queue.size, 0);
  assert.deepEqual(f.angles(), [0, 0]);
});
