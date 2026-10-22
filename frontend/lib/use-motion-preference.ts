"use client";

import { useSyncExternalStore } from "react";
const query = "(prefers-reduced-motion: reduce)";
function subscribe(notify: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function clientSnapshot() {
  return typeof window.matchMedia !== "function" || window.matchMedia(query).matches;
}
const serverSnapshot = () => true;

/** Match the server during hydration; enable motion only after a known preference. */
export function useMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
