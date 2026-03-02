export class InMemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly windowMs: number, private readonly maxHits: number) {}

  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t >= windowStart);
    if (arr.length >= this.maxHits) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}
