export function parseTimestamp(raw: unknown, fallback: number): number {
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return fallback;
}
