import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyReceipt } from "./razorpayService.js";

test("buildWeeklyReceipt stays within Razorpay receipt limit", () => {
  const longUid = "very-long-user-id-abcdefghijklmnopqrstuvwxyz-1234567890";
  const receipt = buildWeeklyReceipt(longUid, 1_777_777_777_777);
  assert.ok(receipt.length <= 40);
});

test("buildWeeklyReceipt is deterministic for same inputs", () => {
  const uid = "user-123";
  const fixedTs = 1_700_000_000_000;
  const first = buildWeeklyReceipt(uid, fixedTs);
  const second = buildWeeklyReceipt(uid, fixedTs);
  assert.equal(first, second);
});
