import { FastifyInstance } from "fastify";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { firebaseAuthMiddleware } from "../middleware/auth.js";
import { ServiceContainer } from "../services/serviceContainer.js";
import { badRequest, forbidden, tooManyRequests, unauthorized } from "../utils/errors.js";
import { dateKeyForTimezone, epochSecToIso, nowIso } from "../utils/time.js";
import { InMemoryRateLimiter } from "../utils/rateLimiter.js";
import { SessionRecord, SubscriptionRecord } from "../types/domain.js";
import { env } from "../config/env.js";

const createSessionSchema = z.object({
  deity: z.literal("krishna").default("krishna"),
  languageMode: z.enum(["hinglish", "english"]).optional()
});

const usagePingSchema = z.object({
  sessionId: z.string().min(1),
  secondsSinceLastPing: z.number().int().min(0).max(60)
});

const usageFinishSchema = z.object({
  sessionId: z.string().min(1),
  secondsUsed: z.number().int().min(0).max(3600),
  endedReason: z.enum(["completed", "quota", "disconnect", "user_ended", "error"]).default("completed")
});

const sessionTurnSchema = z.object({
  sessionId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(1500)
});

const finalizeMemorySchema = z.object({
  sessionId: z.string().min(1)
});

const webrtcOfferSchema = z.object({
  sessionId: z.string().min(1),
  offerSdp: z.string().min(20)
});

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  category: z.string().min(1).max(80),
  message: z.string().max(500).optional(),
  sessionId: z.string().optional()
});

const deviceTokenSchema = z.object({
  token: z.string().min(20)
});

const mePreferencesSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  saveTranscripts: z.boolean().optional(),
  preferredLanguageMode: z.enum(["hinglish", "english"]).optional(),
  timezone: z.string().min(1).max(80).optional()
});

const createWeeklyOrderSchema = z.object({});

const verifyWeeklyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1)
});

const sessionRateLimiter = new InMemoryRateLimiter(60_000, 6);
const abusiveIpLimiter = new InMemoryRateLimiter(60_000, 20);
const ACTIVE_SESSION_STALE_MS = 90_000;
const HARD_STOP_GRACE_MS = 30_000;
const UNKNOWN_DEVICE_TAKEOVER_MS = 20_000;

const shouldRecoverActiveSession = (
  session: SessionRecord,
  requestDeviceId: string | null,
  nowMs: number
): boolean => {
  const sessionDeviceId = session.clientMetadata?.deviceId ?? null;
  const sameDeviceTakeover =
    !!requestDeviceId &&
    !!sessionDeviceId &&
    requestDeviceId === sessionDeviceId;
  if (sameDeviceTakeover) return true;

  const sessionStartMs = Date.parse(session.startedAt);
  const unknownDeviceTakeover =
    !requestDeviceId &&
    !sessionDeviceId &&
    !Number.isNaN(sessionStartMs) &&
    nowMs - sessionStartMs > UNKNOWN_DEVICE_TAKEOVER_MS;
  if (unknownDeviceTakeover) return true;

  const hardStopMs = Date.parse(session.hardStopAt);
  const staleByHardStop = !Number.isNaN(hardStopMs) && nowMs - hardStopMs > HARD_STOP_GRACE_MS;

  const lastActivityMs = Date.parse(session.updatedAt ?? session.startedAt);
  const staleByHeartbeat = !Number.isNaN(lastActivityMs) && nowMs - lastActivityMs > ACTIVE_SESSION_STALE_MS;

  return staleByHardStop || staleByHeartbeat;
};

export const registerV1Routes = async (app: FastifyInstance, services: ServiceContainer) => {
  app.post("/v1/razorpay/webhook", async (request, reply) => {
    const signature = request.headers["x-razorpay-signature"] as string | undefined;
    const payload = JSON.stringify(request.body ?? {});

    services.razorpayService.verifyWebhookSignature(payload, signature);

    const body = request.body as {
      event?: string;
      payload?: {
        subscription?: {
          entity?: {
            id?: string;
            status?: string;
            notes?: { uid?: string };
            current_end?: number;
            ended_at?: number;
          };
        };
      };
    };

    const eventName = body.event ?? "unknown";
    const subEntity = body.payload?.subscription?.entity;
    if (!subEntity?.id || !subEntity.notes?.uid) {
      throw badRequest("Webhook payload missing subscription id or uid");
    }

    const eventId = (request.headers["x-razorpay-event-id"] as string | undefined) ?? `${eventName}:${subEntity.id}`;
    const payloadHash = services.razorpayService.hashPayload(payload);

    const shouldProcess = await services.repo.createWebhookEventIfNotExists(eventId, payloadHash);
    if (!shouldProcess) {
      return reply.send({ ok: true, deduplicated: true });
    }

    const uid = subEntity.notes.uid;
    const currentPeriodEnd = epochSecToIso(subEntity.current_end ?? subEntity.ended_at ?? null);
    const now = nowIso();

    const subscriptionRecord: SubscriptionRecord = {
      id: subEntity.id,
      uid,
      provider: "razorpay",
      status: subEntity.status ?? "unknown",
      nextChargeAt: currentPeriodEnd,
      cancelAtPeriodEnd: false,
      currentPeriodEnd,
      createdAt: now,
      updatedAt: now
    };
    await services.repo.upsertSubscription(subscriptionRecord);

    if (["subscription.activated", "subscription.charged", "subscription.resumed"].includes(eventName)) {
      await services.repo.updateEntitlement(uid, services.entitlementService.markSubscriptionActive(currentPeriodEnd));
      await services.notificationService.enqueuePaymentRecoveredNotification(uid);
      services.metricsService.increment("subscription_events_success");
    } else if (["subscription.halted", "subscription.paused", "payment.failed"].includes(eventName)) {
      await services.repo.updateEntitlement(uid, services.entitlementService.markPastDue());
      await services.notificationService.enqueueRenewalFailedNotification(uid);
      services.metricsService.increment("subscription_events_failure");
    } else if (["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(eventName)) {
      await services.repo.updateEntitlement(uid, services.entitlementService.markExpired());
      services.metricsService.increment("subscription_events_expired");
    }

    return reply.send({ ok: true });
  });

  app.post("/v1/internal/jobs/daily-reminders", async (request) => {
    const token = request.headers["x-internal-token"]?.toString();
    if (!env.INTERNAL_JOB_TOKEN || token !== env.INTERNAL_JOB_TOKEN) {
      throw unauthorized("Invalid internal token");
    }

    const body = (request.body ?? {}) as { userIds?: string[] };
    if (!body.userIds?.length) {
      return { ok: true, processed: 0 };
    }

    let processed = 0;
    for (const uid of body.userIds) {
      await services.notificationService.sendDailyReminder(uid);
      processed += 1;
    }
    return { ok: true, processed };
  });

  app.register(
    async (protectedApp) => {
      protectedApp.addHook("preHandler", firebaseAuthMiddleware);

      protectedApp.get("/me", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const user = await services.repo.upsertUserFromAuth(authUser.uid, authUser.name, authUser.email);
        const entitlement = await services.repo.getOrCreateEntitlement(authUser.uid);
        const usage = await services.repo.getUsageDaily(
          authUser.uid,
          dateKeyForTimezone(new Date(), user.timezone)
        );
        const snapshot = services.entitlementService.toSnapshot(entitlement, usage);

        return {
          user,
          entitlement,
          usage,
          secondsRemainingToday: snapshot.secondsRemainingToday,
          freeTrialRemainingSec: snapshot.freeTrialRemainingSec,
          canStartSession: snapshot.canStartSession,
          blockReason: snapshot.blockReason
        };
      });

      protectedApp.patch("/me/preferences", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = mePreferencesSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const updated = await services.repo.updateUserPreferences(authUser.uid, parsed.data);
        return { ok: true, user: updated };
      });

      protectedApp.post("/realtime/session", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        if (!abusiveIpLimiter.allow(`ip:${request.ip}`)) {
          throw tooManyRequests("Too many requests from this IP");
        }

        const parsed = createSessionSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const deviceId = request.headers["x-device-id"]?.toString() ?? null;
        const rateKey = `${authUser.uid}:${request.ip}:${deviceId ?? "unknown"}`;
        if (!sessionRateLimiter.allow(rateKey)) {
          throw tooManyRequests("Too many session requests. Please wait a minute.");
        }

        const nowMs = Date.now();
        const activeSessions = await services.repo.listActiveSessionsByUid(authUser.uid);
        let blockingSession: SessionRecord | null = null;
        for (const activeSession of activeSessions) {
          if (shouldRecoverActiveSession(activeSession, deviceId, nowMs)) {
            await services.repo.patchSession(activeSession.id, {
              endedAt: nowIso(),
              endedReason: "disconnect"
            });
            services.metricsService.increment("sessions_recovered");
            continue;
          }
          if (!blockingSession) blockingSession = activeSession;
        }
        if (blockingSession) {
          throw forbidden("An active call already exists");
        }

        const user = await services.repo.upsertUserFromAuth(authUser.uid, authUser.name, authUser.email);
        const entitlement = await services.repo.getOrCreateEntitlement(authUser.uid);
        const usage = await services.repo.getUsageDaily(
          authUser.uid,
          dateKeyForTimezone(new Date(), user.timezone)
        );
        const snapshot = services.entitlementService.toSnapshot(entitlement, usage);

        if (!snapshot.canStartSession) {
          throw forbidden(snapshot.blockReason === "trial_exhausted" ? "Free trial exhausted" : "Daily limit reached");
        }

        const languageMode = parsed.data.languageMode ?? user.preferredLanguageMode;
        const allowedSeconds = services.entitlementService.secondsAllowedForNewSession(snapshot);
        const now = Date.now();
        const hardStopAt = new Date(now + allowedSeconds * 1000).toISOString();
        const memorySeed = await services.memoryService.buildSessionMemorySeed(authUser.uid, user.name);
        services.metricsService.increment("memory_seed_built");

        const record: SessionRecord = {
          id: uuidv4(),
          uid: authUser.uid,
          deity: parsed.data.deity,
          startedAt: new Date(now).toISOString(),
          hardStopAt,
          endedAt: null,
          secondsUsed: 0,
          endedReason: null,
          realtimeSessionId: null,
          clientMetadata: {
            ip: request.ip,
            deviceId
          },
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        await services.repo.createSession(record);
        services.metricsService.increment("sessions_started");

        return {
          sessionId: record.id,
          clientSecret: "webrtc-unified",
          realtimeSessionId: null,
          model: env.OPENAI_REALTIME_MODEL,
          hardStopAt,
          secondsAllowed: allowedSeconds,
          persona: {
            deity: "krishna",
            languageMode
          },
          memoryContext: memorySeed.memoryContext,
          openingShloka: memorySeed.openingShloka,
          openingScript: memorySeed.openingScript
        };
      });

      protectedApp.post("/webrtc/offer", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = webrtcOfferSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const session = await services.repo.getSession(parsed.data.sessionId);
        if (!session || session.uid !== authUser.uid) {
          throw forbidden("Session not found");
        }
        if (session.endedAt) {
          throw forbidden("Session already ended");
        }

        const user = await services.repo.getUser(authUser.uid);
        if (!user) throw forbidden("User not found");

        const memorySeed = await services.memoryService.buildSessionMemorySeed(authUser.uid, user.name);
        const answerSdp = await services.openAiService.createRealtimeCallAnswer({
          offerSdp: parsed.data.offerSdp,
          languageMode: user.preferredLanguageMode,
          memoryContext: memorySeed.memoryContext
        });

        await services.repo.patchSession(session.id, { updatedAt: nowIso() });
        return { answerSdp };
      });

      protectedApp.post("/usage/ping", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = usagePingSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const session = await services.repo.getSession(parsed.data.sessionId);
        if (!session || session.uid !== authUser.uid) {
          throw forbidden("Session not found");
        }
        if (session.endedAt) {
          return { ok: true, ended: true };
        }

        await services.repo.patchSession(session.id, {
          updatedAt: nowIso()
        });

        return { ok: true, ended: false };
      });

      protectedApp.post("/usage/finish", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = usageFinishSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const session = await services.repo.getSession(parsed.data.sessionId);
        if (!session || session.uid !== authUser.uid) {
          throw forbidden("Session not found");
        }

        if (session.endedAt) {
          return { ok: true, deduplicated: true };
        }

        const user = await services.repo.getUser(authUser.uid);
        if (!user) throw forbidden("User not found");

        const sessionStarted = new Date(session.startedAt).getTime();
        const maxPossible = Math.max(0, Math.floor((Date.now() - sessionStarted) / 1000) + 5);
        const boundedSeconds = Math.max(0, Math.min(parsed.data.secondsUsed, maxPossible));

        const dateKey = dateKeyForTimezone(new Date(), user.timezone);
        const entitlement = await services.repo.getOrCreateEntitlement(authUser.uid);
        let updatedEntitlement = entitlement;
        if (boundedSeconds > 0) {
          await services.repo.applyUsage(authUser.uid, dateKey, boundedSeconds);
          const entitlementPatch = services.entitlementService.applySessionUsage(entitlement, boundedSeconds);
          updatedEntitlement = await services.repo.updateEntitlement(authUser.uid, entitlementPatch);
        }

        await services.repo.patchSession(session.id, {
          endedAt: nowIso(),
          secondsUsed: boundedSeconds,
          endedReason: parsed.data.endedReason
        });

        const usage = await services.repo.getUsageDaily(authUser.uid, dateKey);
        const snapshot = services.entitlementService.toSnapshot(updatedEntitlement, usage);
        services.metricsService.increment("sessions_finished");
        const memorySummary = await services.memoryService.finalizeSessionMemory(authUser.uid, session.id);
        services.metricsService.increment(memorySummary ? "memory_finalize_ok" : "memory_finalize_empty");

        return {
          ok: true,
          entitlement: updatedEntitlement,
          usage,
          secondsRemainingToday: snapshot.secondsRemainingToday,
          freeTrialRemainingSec: snapshot.freeTrialRemainingSec,
          memorySummary
        };
      });

      protectedApp.post("/session/turn", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = sessionTurnSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const session = await services.repo.getSession(parsed.data.sessionId);
        if (!session || session.uid !== authUser.uid) {
          throw forbidden("Session not found");
        }

        await services.repo.saveSessionTurn(authUser.uid, parsed.data.sessionId, parsed.data.role, parsed.data.text);
        services.metricsService.increment("memory_turn_saved");
        return { ok: true };
      });

      protectedApp.post("/session/finalize-memory", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = finalizeMemorySchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const session = await services.repo.getSession(parsed.data.sessionId);
        if (!session || session.uid !== authUser.uid) {
          throw forbidden("Session not found");
        }

        const summary = await services.memoryService.finalizeSessionMemory(authUser.uid, parsed.data.sessionId);
        services.metricsService.increment(summary ? "memory_finalize_ok" : "memory_finalize_empty");
        return { ok: true, summary };
      });

      protectedApp.post("/payments/weekly-order", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = createWeeklyOrderSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        const order = await services.razorpayService.createWeeklyOrder({ uid: authUser.uid });

        const now = nowIso();
        await services.repo.upsertSubscription({
          id: order.orderId,
          uid: authUser.uid,
          provider: "razorpay",
          status: order.status,
          nextChargeAt: null,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          createdAt: now,
          updatedAt: now
        });

        services.metricsService.increment("weekly_order_create_requests");
        return {
          keyId: env.RAZORPAY_KEY_ID,
          orderId: order.orderId,
          amountPaise: order.amount,
          currency: order.currency,
          status: order.status
        };
      });

      protectedApp.post("/payments/weekly-verify", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = verifyWeeklyPaymentSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        services.razorpayService.verifyPaymentSignature(parsed.data);

        const payment = await services.razorpayService.fetchPayment(parsed.data.razorpayPaymentId);
        if (payment.order_id !== parsed.data.razorpayOrderId) {
          throw badRequest("Payment does not match order");
        }
        if (payment.amount !== env.RAZORPAY_WEEKLY_AMOUNT_PAISE || payment.currency !== "INR") {
          throw badRequest("Invalid payment amount or currency");
        }
        if (!["captured", "authorized"].includes(payment.status)) {
          throw badRequest("Payment not successful");
        }

        const currentPeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await services.repo.updateEntitlement(
          authUser.uid,
          services.entitlementService.markSubscriptionActive(currentPeriodEnd)
        );

        const now = nowIso();
        await services.repo.upsertSubscription({
          id: payment.id,
          uid: authUser.uid,
          provider: "razorpay",
          status: "paid",
          nextChargeAt: currentPeriodEnd,
          cancelAtPeriodEnd: false,
          currentPeriodEnd,
          createdAt: now,
          updatedAt: now
        });

        services.metricsService.increment("weekly_payment_verify_success");
        return {
          ok: true,
          planStatus: "ACTIVE",
          currentPeriodEnd
        };
      });

      protectedApp.post("/feedback", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = feedbackSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        await services.repo.saveFeedback(authUser.uid, parsed.data);
        services.metricsService.increment("feedback_submitted");
        return { ok: true };
      });

      protectedApp.post("/me/device-token", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        const parsed = deviceTokenSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw badRequest("Invalid payload", parsed.error.flatten());

        await services.repo.saveNotificationToken(authUser.uid, parsed.data.token);
        return { ok: true };
      });

      protectedApp.delete("/me", async (request) => {
        const authUser = request.authUser;
        if (!authUser) throw forbidden();

        await services.repo.requestDeletion(authUser.uid);
        return {
          ok: true,
          status: "requested",
          requestedAt: nowIso(),
          completionTimestamp: null
        };
      });
    },
    { prefix: "/v1" }
  );
};
