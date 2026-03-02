import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter } from "./rateLimiter.js";

test("rate limiter blocks after max hits", () => {
  const limiter = new InMemoryRateLimiter(10_000, 2);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), false);
});
