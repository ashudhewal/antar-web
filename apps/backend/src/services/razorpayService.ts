import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

interface CreateSubscriptionInput {
  uid: string;
}

const MAX_RAZORPAY_RECEIPT_LENGTH = 40;

type RazorpayErrorPayload = {
  code?: string;
  description?: string;
  metadata?: unknown;
  reason?: string;
  source?: string;
  step?: string;
};

type RazorpayErrorLike = {
  statusCode?: number;
  message?: string;
  error?: RazorpayErrorPayload;
};

const isRazorpayErrorLike = (error: unknown): error is RazorpayErrorLike => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.statusCode === "number" ||
    typeof candidate.message === "string" ||
    (!!candidate.error && typeof candidate.error === "object")
  );
};

export const buildWeeklyReceipt = (uid: string, timestampMs: number = Date.now()): string => {
  const uidHash = crypto.createHash("sha1").update(uid).digest("hex").slice(0, 12);
  const ts = timestampMs.toString(36);
  return `wk_${uidHash}_${ts}`.slice(0, MAX_RAZORPAY_RECEIPT_LENGTH);
};

const mapRazorpayError = (error: unknown, fallbackCode: string): AppError => {
  if (!isRazorpayErrorLike(error)) {
    return new AppError(502, fallbackCode, "Razorpay request failed", { cause: String(error) });
  }

  const statusCode =
    typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 502;
  const code = statusCode < 500 ? "RAZORPAY_BAD_REQUEST" : fallbackCode;
  const message =
    error.error?.description?.trim() || error.message?.trim() || "Razorpay request failed";

  return new AppError(statusCode, code, message, {
    razorpayCode: error.error?.code ?? null,
    reason: error.error?.reason ?? null,
    source: error.error?.source ?? null,
    step: error.error?.step ?? null,
    metadata: error.error?.metadata ?? null
  });
};

export class RazorpayService {
  private client: Razorpay | null;

  constructor() {
    if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
      this.client = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET
      });
    } else {
      this.client = null;
    }
  }

  async createWeeklyOrder({ uid }: CreateSubscriptionInput) {
    if (!this.client) {
      throw new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Razorpay is not configured");
    }
    const client = this.client;

    const order = await (async () => {
      try {
        return await client.orders.create({
          amount: env.RAZORPAY_WEEKLY_AMOUNT_PAISE,
          currency: "INR",
          receipt: buildWeeklyReceipt(uid),
          notes: {
            uid,
            kind: "weekly_one_time"
          }
        });
      } catch (error) {
        throw mapRazorpayError(error, "RAZORPAY_ORDER_CREATE_FAILED");
      }
    })();

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    };
  }

  verifyPaymentSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): void {
    if (!env.RAZORPAY_KEY_SECRET) {
      throw new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Razorpay is not configured");
    }
    const payload = `${input.razorpayOrderId}|${input.razorpayPaymentId}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest("hex");

    if (expected !== input.razorpaySignature) {
      throw new AppError(401, "INVALID_PAYMENT_SIGNATURE", "Payment signature verification failed");
    }
  }

  async fetchPayment(paymentId: string) {
    if (!this.client) {
      throw new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Razorpay is not configured");
    }

    try {
      return await this.client.payments.fetch(paymentId);
    } catch (error) {
      throw mapRazorpayError(error, "RAZORPAY_PAYMENT_FETCH_FAILED");
    }
  }

  verifyWebhookSignature(payload: string, signature?: string): void {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      throw new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Razorpay webhook secret missing");
    }
    if (!signature) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing Razorpay signature header");
    }

    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    if (expected !== signature) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed");
    }
  }

  hashPayload(payload: string): string {
    return crypto.createHash("sha256").update(payload).digest("hex");
  }
}
