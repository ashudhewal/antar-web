import { COLLECTIONS } from "../constants/collections.js";
import { env } from "../config/env.js";
import { getFirestore } from "../services/firebase.js";
import { nowIso, dateKeyForTimezone } from "../utils/time.js";

type Mode = "trial" | "paid" | "expired";

type Args = {
  uid?: string;
  email?: string;
  mode: Mode;
  trialSec: number;
  dailySec: number;
  clearTodayUsage: boolean;
  timezone: string;
};

const parseArgs = (): Args => {
  const raw = process.argv.slice(2);
  const out: Args = {
    mode: "trial",
    trialSec: env.TRIAL_TOTAL_SECONDS,
    dailySec: env.PAID_DAILY_SECONDS,
    clearTodayUsage: true,
    timezone: env.DEFAULT_TIMEZONE
  };

  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    const next = raw[i + 1];
    if (token === "--uid" && next) {
      out.uid = next;
      i += 1;
    } else if (token === "--email" && next) {
      out.email = next.toLowerCase();
      i += 1;
    } else if (token === "--mode" && next) {
      if (next === "trial" || next === "paid" || next === "expired") {
        out.mode = next;
      } else {
        throw new Error(`Invalid --mode '${next}'. Use trial|paid|expired`);
      }
      i += 1;
    } else if (token === "--trial-sec" && next) {
      out.trialSec = Number(next);
      i += 1;
    } else if (token === "--daily-sec" && next) {
      out.dailySec = Number(next);
      i += 1;
    } else if (token === "--clear-today-usage") {
      out.clearTodayUsage = true;
    } else if (token === "--keep-today-usage") {
      out.clearTodayUsage = false;
    } else if (token === "--timezone" && next) {
      out.timezone = next;
      i += 1;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!out.uid && !out.email) {
    throw new Error("Provide either --uid <firebase_uid> or --email <user_email>");
  }
  if (!Number.isFinite(out.trialSec) || out.trialSec < 0) {
    throw new Error("--trial-sec must be a non-negative number");
  }
  if (!Number.isFinite(out.dailySec) || out.dailySec < 0) {
    throw new Error("--daily-sec must be a non-negative number");
  }

  return out;
};

const printHelp = (): void => {
  console.log(`Usage:
  npm run admin:grant -- --uid <UID> [--mode trial|paid|expired] [--trial-sec 300] [--daily-sec 600]
  npm run admin:grant -- --email <EMAIL> [--mode trial|paid|expired]

Options:
  --uid                 Firebase UID in users/entitlements docs.
  --email               Email to resolve UID from users collection.
  --mode                trial (default), paid, expired.
  --trial-sec           Trial seconds to assign in trial mode.
  --daily-sec           Daily limit seconds for paid mode (and entitlement record).
  --clear-today-usage   Clear today's usage_daily doc (default).
  --keep-today-usage    Keep today's usage_daily doc untouched.
  --timezone            Date key timezone for usage reset (default from env.DEFAULT_TIMEZONE).`);
};

const resolveUidByEmail = async (email: string): Promise<string | null> => {
  const db = getFirestore();
  const snap = await db
    .collection(COLLECTIONS.users)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const db = getFirestore();
  const uid = args.uid ?? (args.email ? await resolveUidByEmail(args.email) : null);
  if (!uid) {
    throw new Error(`No user found for email '${args.email}'`);
  }

  const now = nowIso();
  const entitlementPatch: Record<string, unknown> = {
    uid,
    dailyLimitSec: args.dailySec,
    updatedAt: now
  };

  if (args.mode === "trial") {
    entitlementPatch.planStatus = args.trialSec > 0 ? "FREE" : "TRIAL_EXHAUSTED";
    entitlementPatch.freeTrialRemainingSec = args.trialSec;
    entitlementPatch.planSource = "FREE";
    entitlementPatch.currentPeriodEnd = null;
    entitlementPatch.pastDueGraceUntil = null;
  } else if (args.mode === "paid") {
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    entitlementPatch.planStatus = "ACTIVE";
    entitlementPatch.planSource = "RAZORPAY";
    entitlementPatch.currentPeriodEnd = periodEnd;
    entitlementPatch.pastDueGraceUntil = null;
  } else if (args.mode === "expired") {
    entitlementPatch.planStatus = "EXPIRED";
    entitlementPatch.planSource = "FREE";
    entitlementPatch.currentPeriodEnd = null;
    entitlementPatch.pastDueGraceUntil = null;
  }

  await db.collection(COLLECTIONS.entitlements).doc(uid).set(entitlementPatch, { merge: true });

  if (args.clearTodayUsage) {
    const dateKey = dateKeyForTimezone(new Date(), args.timezone);
    const usageId = `${uid}_${dateKey}`;
    await db.collection(COLLECTIONS.usageDaily).doc(usageId).set(
      {
        id: usageId,
        uid,
        dateKey,
        secondsUsed: 0,
        sessionsCount: 0,
        lastSessionEndedAt: null,
        updatedAt: now
      },
      { merge: true }
    );
    console.log(`Reset usage_daily/${usageId}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: env.FIREBASE_PROJECT_ID,
        uid,
        mode: args.mode,
        trialSec: args.trialSec,
        dailySec: args.dailySec,
        clearTodayUsage: args.clearTodayUsage
      },
      null,
      2
    )
  );
};

main().catch((err) => {
  console.error(`admin:grant failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
