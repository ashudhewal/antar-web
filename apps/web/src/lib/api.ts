import { getFirebaseAuth } from "@/lib/firebase";
import { apiFriendlyError } from "@/lib/errors";
import { getStableDeviceId } from "@/lib/storage";
import {
  CreateRealtimeSessionResponse,
  CreateWeeklyOrderResponse,
  MeResponse,
  UsageFinishResponse,
  VerifyWeeklyPaymentResponse
} from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  console.warn("NEXT_PUBLIC_API_BASE_URL is not set");
}

type RequestOptions = RequestInit & {
  authRequired?: boolean;
};

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("x-device-id", getStableDeviceId());

  if (options.authRequired !== false) {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser ?? null;
    const token = user ? await user.getIdToken(false) : null;
    if (!token) throw new Error("Please sign in again.");
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let message = "Request failed";
    let code = "";
    try {
      const data = await res.json();
      code = data?.error?.code || "";
      message = data?.error?.message || message;
    } catch {
      message = `HTTP ${res.status}`;
    }
    throw new Error(apiFriendlyError(res.status, code, message, "Request failed"));
  }

  return res.json() as Promise<T>;
}

export const backendApi = {
  me: () => apiRequest<MeResponse>("/v1/me"),
  updatePreferences: (payload: Partial<MeResponse["user"]>) => apiRequest<{ ok: boolean }>("/v1/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(payload)
  }),
  createSession: (languageMode: "hinglish" | "english") =>
    apiRequest<CreateRealtimeSessionResponse>("/v1/realtime/session", {
      method: "POST",
      body: JSON.stringify({ deity: "krishna", languageMode })
    }),
  createWebRtcAnswer: (sessionId: string, offerSdp: string) => apiRequest<{ answerSdp: string }>("/v1/webrtc/offer", {
    method: "POST",
    body: JSON.stringify({ sessionId, offerSdp })
  }),
  usagePing: (sessionId: string, secondsSinceLastPing: number) => apiRequest<{ ok: boolean }>("/v1/usage/ping", {
    method: "POST",
    body: JSON.stringify({ sessionId, secondsSinceLastPing })
  }),
  usageFinish: (sessionId: string, secondsUsed: number, endedReason: string) => apiRequest<UsageFinishResponse>("/v1/usage/finish", {
    method: "POST",
    body: JSON.stringify({ sessionId, secondsUsed, endedReason })
  }),
  saveTurn: (sessionId: string, role: "user" | "assistant", text: string) => apiRequest<{ ok: boolean }>("/v1/session/turn", {
    method: "POST",
    body: JSON.stringify({ sessionId, role, text })
  }),
  finalizeMemory: (sessionId: string) => apiRequest<{ ok: boolean }>("/v1/session/finalize-memory", {
    method: "POST",
    body: JSON.stringify({ sessionId })
  }),
  createWeeklyOrder: () => apiRequest<CreateWeeklyOrderResponse>("/v1/payments/weekly-order", {
    method: "POST",
    body: JSON.stringify({})
  }),
  verifyWeeklyPayment: (payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    apiRequest<VerifyWeeklyPaymentResponse>("/v1/payments/weekly-verify", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  feedback: (payload: { rating: number; category: string; message?: string; sessionId?: string | null }) =>
    apiRequest<{ ok: boolean }>("/v1/feedback", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  requestDeleteMe: () => apiRequest<{ ok: boolean }>("/v1/me", { method: "DELETE" })
};
