interface RateEntry { count: number; reset: number; }
const map = new Map<string, RateEntry>();

export function isRateLimited(
  key: string,
  max = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const e   = map.get(key) ?? { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count++;
  map.set(key, e);
  return e.count > max;
}
