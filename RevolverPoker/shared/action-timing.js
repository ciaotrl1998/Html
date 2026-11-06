export const ACTION_TIMING = Object.freeze({
  duration: 900,
  pause: 500,
  release: 180,
  flight: 540,
  thinkMin: 2500,
  thinkMax: 4000
});

export function presentationTiming(presentation, serverTime) {
  const elapsed = Math.max(0, (serverTime ?? presentation?.startedAt) - (presentation?.startedAt ?? 0));
  return { elapsed, delay: Math.max(0, ACTION_TIMING.release - elapsed),
    duration: Math.max(1, ACTION_TIMING.flight - Math.max(0, elapsed - ACTION_TIMING.release)) };
}
