interface Bounds { left: number; top: number; width: number; height: number }
interface Surface { style: { transform: string; transition: string } }
interface Scheduler {
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
}

/** Pointer angles are transient DOM values, never React state. */
export function createPointerTilt(surface: Surface, bounds: () => Bounds, scheduler: Scheduler) {
  let rect: Bounds | null = null;
  let frame: number | null = null;
  let previous = 0;
  let inside = false;
  let disposed = false;
  let x = 0, y = 0, targetX = 0, targetY = 0, velocityX = 0, velocityY = 0;
  const clamp = (value: number) => Math.max(-3, Math.min(3, value));
  const write = () => {
    surface.style.transition = "none";
    surface.style.transform = `rotateX(${clamp(x).toFixed(4)}deg) rotateY(${clamp(y).toFixed(4)}deg)`;
  };
  const tick = (time: number) => {
    frame = null;
    if (disposed) return;
    const dt = Math.min(1 / 30, Math.max(1 / 240, previous ? (time - previous) / 1000 : 1 / 60));
    previous = time;
    if (inside) {
      const fraction = 1 - Math.pow(0.82, dt * 60);
      x += (targetX - x) * fraction;
      y += (targetY - y) * fraction;
    } else {
      // Same 100/10 spring as the entrance and receipt; no CSS transition fights the frame.
      velocityX += (-100 * x - 10 * velocityX) * dt;
      velocityY += (-100 * y - 10 * velocityY) * dt;
      x += velocityX * dt;
      y += velocityY * dt;
    }
    write();
    const unsettled = inside
      ? Math.abs(targetX - x) + Math.abs(targetY - y) > 0.002
      : Math.abs(x) + Math.abs(y) + Math.abs(velocityX) + Math.abs(velocityY) > 0.002;
    if (unsettled) frame = scheduler.request(tick);
    else { if (!inside) { x = y = 0; write(); } previous = 0; }
  };
  const schedule = () => { if (frame === null && !disposed) frame = scheduler.request(tick); };
  const flatten = () => {
    inside = false;
    rect = null;
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    previous = x = y = targetX = targetY = velocityX = velocityY = 0;
    write();
  };
  return {
    enter(allowed: boolean) {
      if (disposed || !allowed) { flatten(); return; }
      rect = bounds();
      if (rect.width <= 0 || rect.height <= 0) { flatten(); return; }
      inside = true;
      velocityX = velocityY = 0;
    },
    move(clientX: number, clientY: number) {
      if (!inside || !rect || disposed) return;
      targetX = clamp(-((clientY - rect.top) / rect.height - 0.5) * 6);
      targetY = clamp(((clientX - rect.left) / rect.width - 0.5) * 6);
      schedule();
    },
    leave() { inside = false; rect = null; targetX = targetY = 0; schedule(); },
    flatten,
    dispose() { flatten(); disposed = true; },
  };
}
