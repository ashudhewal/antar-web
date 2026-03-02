export type PlanStatus = "FREE" | "TRIAL_EXHAUSTED" | "ACTIVE" | "PAST_DUE" | "EXPIRED";

export interface UserProfile {
  uid: string;
  name: string | null;
  email: string | null;
  locale: string;
  timezone: string;
  preferredLanguageMode: "hinglish" | "english";
  reminderEnabled: boolean;
  saveTranscripts: boolean;
  notificationToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entitlement {
  uid: string;
  planStatus: PlanStatus;
  freeTrialRemainingSec: number;
  dailyLimitSec: number;
  planSource: "FREE" | "RAZORPAY";
  currentPeriodEnd: string | null;
  pastDueGraceUntil: string | null;
  updatedAt: string;
}

export interface UsageDaily {
  id: string;
  uid: string;
  dateKey: string;
  secondsUsed: number;
  sessionsCount: number;
  lastSessionEndedAt: string | null;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  uid: string;
  deity: "krishna";
  startedAt: string;
  hardStopAt: string;
  endedAt: string | null;
  secondsUsed: number;
  endedReason: "completed" | "quota" | "disconnect" | "user_ended" | "error" | null;
  realtimeSessionId: string | null;
  clientMetadata: {
    ip: string | null;
    deviceId: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  uid: string;
  provider: "razorpay";
  status: string;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionTurn {
  id: string;
  sessionId: string;
  uid: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  uid: string;
  summaryShort: string;
  factsExtracted: string[];
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserMemory {
  uid: string;
  profileFacts: string[];
  stableFacts: string[];
  episodicRecent: Array<{
    sessionId: string;
    summaryShort: string;
    createdAt: string;
  }>;
  lastShlokaIds: string[];
  updatedAt: string;
}
