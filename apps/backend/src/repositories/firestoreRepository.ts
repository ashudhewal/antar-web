import { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "../constants/collections.js";
import { env } from "../config/env.js";
import {
  Entitlement,
  SessionRecord,
  SessionSummary,
  SessionTurn,
  SubscriptionRecord,
  UsageDaily,
  UserMemory,
  UserProfile
} from "../types/domain.js";
import { nowIso } from "../utils/time.js";

export class FirestoreRepository {
  constructor(private readonly db: Firestore) {}

  async upsertUserFromAuth(uid: string, name?: string, email?: string): Promise<UserProfile> {
    const ref = this.db.collection(COLLECTIONS.users).doc(uid);
    const snap = await ref.get();
    const now = nowIso();
    if (!snap.exists) {
      const record: UserProfile = {
        uid,
        name: name ?? null,
        email: email ?? null,
        locale: "en-IN",
        timezone: env.DEFAULT_TIMEZONE,
        preferredLanguageMode: "hinglish",
        reminderEnabled: true,
        saveTranscripts: false,
        notificationToken: null,
        createdAt: now,
        updatedAt: now
      };
      await ref.set(record);
      return record;
    }

    const merged = {
      ...(snap.data() as UserProfile),
      name: name ?? (snap.data() as UserProfile).name,
      email: email ?? (snap.data() as UserProfile).email,
      updatedAt: now
    } as UserProfile;
    await ref.set(merged, { merge: true });
    return merged;
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    const snap = await this.db.collection(COLLECTIONS.users).doc(uid).get();
    return snap.exists ? (snap.data() as UserProfile) : null;
  }

  async getOrCreateEntitlement(uid: string): Promise<Entitlement> {
    const ref = this.db.collection(COLLECTIONS.entitlements).doc(uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as Entitlement;

    const record: Entitlement = {
      uid,
      planStatus: "FREE",
      freeTrialRemainingSec: env.TRIAL_TOTAL_SECONDS,
      dailyLimitSec: env.PAID_DAILY_SECONDS,
      planSource: "FREE",
      currentPeriodEnd: null,
      pastDueGraceUntil: null,
      updatedAt: nowIso()
    };
    await ref.set(record);
    return record;
  }

  async updateEntitlement(uid: string, patch: Partial<Entitlement>): Promise<Entitlement> {
    const ref = this.db.collection(COLLECTIONS.entitlements).doc(uid);
    await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
    const snap = await ref.get();
    return snap.data() as Entitlement;
  }

  async getUsageDaily(uid: string, dateKey: string): Promise<UsageDaily> {
    const id = `${uid}_${dateKey}`;
    const ref = this.db.collection(COLLECTIONS.usageDaily).doc(id);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as UsageDaily;

    const record: UsageDaily = {
      id,
      uid,
      dateKey,
      secondsUsed: 0,
      sessionsCount: 0,
      lastSessionEndedAt: null,
      updatedAt: nowIso()
    };
    await ref.set(record);
    return record;
  }

  async applyUsage(uid: string, dateKey: string, secondsUsed: number): Promise<UsageDaily> {
    const id = `${uid}_${dateKey}`;
    const ref = this.db.collection(COLLECTIONS.usageDaily).doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = nowIso();
      if (!snap.exists) {
        tx.set(ref, {
          id,
          uid,
          dateKey,
          secondsUsed,
          sessionsCount: 1,
          lastSessionEndedAt: now,
          updatedAt: now
        } as UsageDaily);
        return;
      }
      const current = snap.data() as UsageDaily;
      tx.set(
        ref,
        {
          secondsUsed: current.secondsUsed + secondsUsed,
          sessionsCount: current.sessionsCount + 1,
          lastSessionEndedAt: now,
          updatedAt: now
        },
        { merge: true }
      );
    });

    const updated = await ref.get();
    return updated.data() as UsageDaily;
  }

  async createSession(input: SessionRecord): Promise<SessionRecord> {
    await this.db.collection(COLLECTIONS.sessions).doc(input.id).set(input);
    return input;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const snap = await this.db.collection(COLLECTIONS.sessions).doc(sessionId).get();
    return snap.exists ? (snap.data() as SessionRecord) : null;
  }

  async patchSession(sessionId: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const ref = this.db.collection(COLLECTIONS.sessions).doc(sessionId);
    await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
    const snap = await ref.get();
    return snap.data() as SessionRecord;
  }

  async upsertSubscription(record: SubscriptionRecord): Promise<void> {
    await this.db.collection(COLLECTIONS.subscriptions).doc(record.id).set(record, { merge: true });
  }

  async createWebhookEventIfNotExists(eventId: string, payloadHash: string): Promise<boolean> {
    const ref = this.db.collection(COLLECTIONS.webhookEvents).doc(eventId);
    const snap = await ref.get();
    if (snap.exists) return false;
    await ref.set({
      eventId,
      payloadHash,
      status: "processed",
      processedAt: nowIso()
    });
    return true;
  }

  async saveFeedback(uid: string, data: { rating: number; category: string; message?: string; sessionId?: string }): Promise<void> {
    await this.db.collection(COLLECTIONS.feedback).add({
      uid,
      ...data,
      createdAt: nowIso()
    });
  }

  async saveNotificationToken(uid: string, token: string): Promise<void> {
    await this.db.collection(COLLECTIONS.users).doc(uid).set({
      notificationToken: token,
      updatedAt: nowIso()
    }, { merge: true });
  }

  async updateUserPreferences(
    uid: string,
    patch: Partial<Pick<UserProfile, "reminderEnabled" | "saveTranscripts" | "preferredLanguageMode" | "timezone">>
  ): Promise<UserProfile> {
    const ref = this.db.collection(COLLECTIONS.users).doc(uid);
    await ref.set(
      {
        ...patch,
        updatedAt: nowIso()
      },
      { merge: true }
    );
    const snap = await ref.get();
    return snap.data() as UserProfile;
  }

  async listActiveSessionsByUid(uid: string): Promise<SessionRecord[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.sessions)
      .where("uid", "==", uid)
      .where("endedAt", "==", null)
      .get();
    const rows = snapshot.docs.map((doc) => doc.data() as SessionRecord);
    rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return rows;
  }

  async saveSessionTurn(uid: string, sessionId: string, role: "user" | "assistant", text: string): Promise<SessionTurn> {
    const now = nowIso();
    const turn: SessionTurn = {
      id: randomUUID(),
      sessionId,
      uid,
      role,
      text,
      createdAt: now
    };
    await this.db.collection(COLLECTIONS.sessionTurns).doc(turn.id).set(turn);
    return turn;
  }

  async listSessionTurns(sessionId: string, limit = 120): Promise<SessionTurn[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.sessionTurns)
      .where("sessionId", "==", sessionId)
      .get();
    const rows = snapshot.docs.map((doc) => doc.data() as SessionTurn);
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows.slice(-limit);
  }

  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    const snap = await this.db.collection(COLLECTIONS.sessionSummaries).doc(sessionId).get();
    return snap.exists ? (snap.data() as SessionSummary) : null;
  }

  async upsertSessionSummary(summary: SessionSummary): Promise<void> {
    await this.db.collection(COLLECTIONS.sessionSummaries).doc(summary.sessionId).set(summary, { merge: true });
  }

  async listRecentSessionSummaries(uid: string, limit = 8): Promise<SessionSummary[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.sessionSummaries)
      .where("uid", "==", uid)
      .get();
    const rows = snapshot.docs.map((doc) => doc.data() as SessionSummary);
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows.slice(0, limit);
  }

  async getOrCreateUserMemory(uid: string): Promise<UserMemory> {
    const ref = this.db.collection(COLLECTIONS.userMemory).doc(uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as UserMemory;
    const record: UserMemory = {
      uid,
      profileFacts: [],
      stableFacts: [],
      episodicRecent: [],
      lastShlokaIds: [],
      updatedAt: nowIso()
    };
    await ref.set(record);
    return record;
  }

  async updateUserMemory(uid: string, patch: Partial<UserMemory>): Promise<UserMemory> {
    const ref = this.db.collection(COLLECTIONS.userMemory).doc(uid);
    await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
    const snap = await ref.get();
    return snap.data() as UserMemory;
  }

  async requestDeletion(uid: string): Promise<void> {
    await this.db.collection(COLLECTIONS.deletionRequests).doc(uid).set({
      uid,
      status: "requested",
      requestedAt: nowIso()
    }, { merge: true });
  }
}
