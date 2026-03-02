"use client";

import { useAuth } from "@/contexts/auth";
import { backendApi } from "@/lib/api";
import { MeResponse } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await backendApi.me();
    setMe(data);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile, router, user]);

  if (!user) return null;

  return (
    <main className="screen" style={{ gap: "1rem" }}>
      <button className="btn btn-secondary" onClick={() => router.back()}>Back</button>
      <h1 style={{ marginBottom: 0 }}>Profile</h1>
      <p className="note">{me?.user.email || user.email || "--"}</p>
      <p>Subscription: {me?.entitlement.planStatus || "--"}</p>

      <section className="panel" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <label className="row">
          Daily reminders
          <input
            type="checkbox"
            checked={Boolean(me?.user.reminderEnabled)}
            onChange={async (e) => {
              await backendApi.updatePreferences({ reminderEnabled: e.target.checked });
              await refresh();
            }}
          />
        </label>

        <label className="row">
          Save transcripts
          <input
            type="checkbox"
            checked={Boolean(me?.user.saveTranscripts)}
            onChange={async (e) => {
              await backendApi.updatePreferences({ saveTranscripts: e.target.checked });
              await refresh();
            }}
          />
        </label>

        <button
          className="btn btn-secondary"
          onClick={async () => {
            await backendApi.feedback({ rating: 1, category: "general_feedback", message: "User feedback from profile" });
            setNotice("Submitted");
          }}
        >
          Give feedback
        </button>

        <button
          className="btn btn-secondary"
          onClick={async () => {
            await backendApi.requestDeleteMe();
            setNotice("Deletion request submitted");
          }}
        >
          Delete my data
        </button>

        <button
          className="btn btn-secondary"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </section>

      <div className="row">
        <Link href="/legal/privacy">Privacy Policy</Link>
        <Link href="/legal/terms">Terms</Link>
      </div>

      {notice && <p>{notice}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
