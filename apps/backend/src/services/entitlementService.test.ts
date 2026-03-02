import test from "node:test";
import assert from "node:assert/strict";
import { EntitlementService } from "./entitlementService.js";
import { Entitlement, UsageDaily } from "../types/domain.js";

const service = new EntitlementService();

const baseEntitlement = (): Entitlement => ({
  uid: "u1",
  planStatus: "FREE",
  freeTrialRemainingSec: 300,
  dailyLimitSec: 600,
  planSource: "FREE",
  currentPeriodEnd: null,
  pastDueGraceUntil: null,
  updatedAt: new Date().toISOString()
});

const usage = (secondsUsed: number): UsageDaily => ({
  id: "u1_2026-01-01",
  uid: "u1",
  dateKey: "2026-01-01",
  secondsUsed,
  sessionsCount: 1,
  lastSessionEndedAt: null,
  updatedAt: new Date().toISOString()
});

test("free user can start session when trial remains", () => {
  const snapshot = service.toSnapshot(baseEntitlement(), usage(0));
  assert.equal(snapshot.canStartSession, true);
  assert.equal(snapshot.blockReason, null);
});

test("free user blocked when trial exhausted", () => {
  const entitlement = baseEntitlement();
  entitlement.freeTrialRemainingSec = 0;
  const snapshot = service.toSnapshot(entitlement, usage(0));
  assert.equal(snapshot.canStartSession, false);
  assert.equal(snapshot.blockReason, "trial_exhausted");
});

test("active user blocked when daily limit reached", () => {
  const entitlement = baseEntitlement();
  entitlement.planStatus = "ACTIVE";
  const snapshot = service.toSnapshot(entitlement, usage(600));
  assert.equal(snapshot.canStartSession, false);
  assert.equal(snapshot.blockReason, "daily_limit");
});

test("applySessionUsage decrements free trial", () => {
  const patch = service.applySessionUsage(baseEntitlement(), 120);
  assert.equal(patch.freeTrialRemainingSec, 180);
  assert.equal(patch.planStatus, "FREE");
});

test("applySessionUsage transitions free to exhausted", () => {
  const entitlement = baseEntitlement();
  entitlement.freeTrialRemainingSec = 60;
  const patch = service.applySessionUsage(entitlement, 60);
  assert.equal(patch.freeTrialRemainingSec, 0);
  assert.equal(patch.planStatus, "TRIAL_EXHAUSTED");
});
