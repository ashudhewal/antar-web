export type LanguageMode = "hinglish" | "english";

export interface MeUser {
  uid: string;
  name: string | null;
  email: string | null;
  locale: string;
  timezone: string;
  preferredLanguageMode: LanguageMode;
  reminderEnabled: boolean;
  saveTranscripts: boolean;
  notificationToken: string | null;
}

export interface MeEntitlement {
  uid: string;
  planStatus: "FREE" | "TRIAL_EXHAUSTED" | "ACTIVE" | "PAST_DUE" | "EXPIRED";
  freeTrialRemainingSec: number;
  dailyLimitSec: number;
  planSource: "FREE" | "RAZORPAY";
  currentPeriodEnd: string | null;
}

export interface MeUsage {
  id: string;
  uid: string;
  dateKey: string;
  secondsUsed: number;
  sessionsCount: number;
  lastSessionEndedAt: string | null;
}

export interface MeResponse {
  user: MeUser;
  entitlement: MeEntitlement;
  usage: MeUsage;
  secondsRemainingToday: number;
  freeTrialRemainingSec: number;
  canStartSession: boolean;
  blockReason: string | null;
}

export interface CreateRealtimeSessionResponse {
  sessionId: string;
  clientSecret: string;
  realtimeSessionId: string | null;
  model: string;
  hardStopAt: string;
  secondsAllowed: number;
  persona: {
    deity: string;
    languageMode: LanguageMode;
  };
  memoryContext?: string | null;
  openingScript?: string | null;
}

export interface UsageFinishResponse {
  ok: boolean;
  secondsRemainingToday: number;
  freeTrialRemainingSec: number;
}

export interface CreateWeeklyOrderResponse {
  keyId: string | null;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface VerifyWeeklyPaymentResponse {
  ok: boolean;
  planStatus: string;
  currentPeriodEnd: string;
}

export interface AuthSession {
  uid: string;
  name: string | null;
  email: string | null;
}

export interface CallSessionState {
  sessionId: string | null;
  secondsRemaining: number;
  connectionState: "idle" | "connecting" | "live" | "ended" | "error";
  transcriptPreview: string;
  error: string | null;
}

export interface PaymentState {
  loading: boolean;
  verifiedUntil: string | null;
  error: string | null;
}

export interface UserPreferences {
  reminderEnabled: boolean;
  saveTranscripts: boolean;
  preferredLanguageMode: LanguageMode;
  timezone: string;
}
