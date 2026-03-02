import { env } from "../config/env.js";
import { Entitlement, UsageDaily } from "../types/domain.js";
import { addHoursIso, nowIso } from "../utils/time.js";

export interface EntitlementSnapshot {
  planStatus: Entitlement["planStatus"];
  freeTrialRemainingSec: number;
  secondsRemainingToday: number;
  canStartSession: boolean;
  blockReason: "trial_exhausted" | "daily_limit" | null;
}

export class EntitlementService {
  toSnapshot(entitlement: Entitlement, usageDaily: UsageDaily): EntitlementSnapshot {
    const now = new Date();

    let effectiveStatus = entitlement.planStatus;
    if (entitlement.planStatus === "PAST_DUE" && entitlement.pastDueGraceUntil) {
      if (new Date(entitlement.pastDueGraceUntil) < now) {
        effectiveStatus = "EXPIRED";
      }
    }

    const secondsRemainingToday = Math.max(0, entitlement.dailyLimitSec - usageDaily.secondsUsed);

    if (effectiveStatus === "ACTIVE" || effectiveStatus === "PAST_DUE") {
      return {
        planStatus: effectiveStatus,
        freeTrialRemainingSec: entitlement.freeTrialRemainingSec,
        secondsRemainingToday,
        canStartSession: secondsRemainingToday > 0,
        blockReason: secondsRemainingToday > 0 ? null : "daily_limit"
      };
    }

    const canStartTrial = entitlement.freeTrialRemainingSec > 0;
    return {
      planStatus: canStartTrial ? "FREE" : "TRIAL_EXHAUSTED",
      freeTrialRemainingSec: entitlement.freeTrialRemainingSec,
      secondsRemainingToday,
      canStartSession: canStartTrial,
      blockReason: canStartTrial ? null : "trial_exhausted"
    };
  }

  secondsAllowedForNewSession(snapshot: EntitlementSnapshot): number {
    if (!snapshot.canStartSession) return 0;
    if (snapshot.planStatus === "ACTIVE" || snapshot.planStatus === "PAST_DUE") {
      return snapshot.secondsRemainingToday;
    }
    return snapshot.freeTrialRemainingSec;
  }

  applySessionUsage(entitlement: Entitlement, secondsUsed: number): Partial<Entitlement> {
    if (entitlement.planStatus === "ACTIVE" || entitlement.planStatus === "PAST_DUE") {
      return { updatedAt: nowIso() };
    }

    const remaining = Math.max(0, entitlement.freeTrialRemainingSec - secondsUsed);
    return {
      freeTrialRemainingSec: remaining,
      planStatus: remaining > 0 ? "FREE" : "TRIAL_EXHAUSTED",
      updatedAt: nowIso()
    };
  }

  markSubscriptionActive(currentPeriodEnd?: string | null): Partial<Entitlement> {
    return {
      planStatus: "ACTIVE",
      planSource: "RAZORPAY",
      currentPeriodEnd: currentPeriodEnd ?? null,
      pastDueGraceUntil: null,
      dailyLimitSec: env.PAID_DAILY_SECONDS,
      updatedAt: nowIso()
    };
  }

  markPastDue(): Partial<Entitlement> {
    const now = nowIso();
    return {
      planStatus: "PAST_DUE",
      pastDueGraceUntil: addHoursIso(now, env.PAST_DUE_GRACE_HOURS),
      updatedAt: now
    };
  }

  markExpired(): Partial<Entitlement> {
    return {
      planStatus: "EXPIRED",
      pastDueGraceUntil: null,
      updatedAt: nowIso()
    };
  }
}
