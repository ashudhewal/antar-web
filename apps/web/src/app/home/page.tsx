"use client";

import { useAuth } from "@/contexts/auth";
import { backendApi } from "@/lib/api";
import { getLanguageMode, setLanguageMode } from "@/lib/storage";
import { MeResponse } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<"hinglish" | "english">(() => getLanguageMode());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const data = await backendApi.me();
        setMe(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user]);

  const used = useMemo(() => {
    if (!me) return 0;
    return Math.max(0, me.entitlement.dailyLimitSec - me.secondsRemainingToday);
  }, [me]);

  return (
    <>
      <video className="bg-video" autoPlay muted loop playsInline src="/assets/homepage_bg_video.mp4" />
      <div className="video-overlay" />
      <main className="screen" style={{ gap: "1rem" }}>
        <div className="row">
          <div>
            <h1 style={{ margin: 0 }}>Krishna</h1>
            <p className="note" style={{ margin: 0 }}>Your AI devotional companion</p>
          </div>
          <Link href="/profile" className="badge">Profile</Link>
        </div>

        <section className="panel" style={{ padding: "1rem" }}>
          <div className="row">
            <span>Language</span>
            <select
              value={lang}
              onChange={async (e) => {
                const mode = e.target.value === "english" ? "english" : "hinglish";
                setLang(mode);
                setLanguageMode(mode);
                await backendApi.updatePreferences({ preferredLanguageMode: mode });
              }}
            >
              <option value="hinglish">Hindi (Hinglish)</option>
              <option value="english">English</option>
            </select>
          </div>
          <p>Daily limit used: {used}s / {me?.entitlement.dailyLimitSec ?? 0}s</p>
          {me?.blockReason === "trial_exhausted" && <p className="error">Free trial is over. Upgrade to continue.</p>}
          {me?.blockReason === "daily_limit" && <p className="error">Daily limit reached. Come back tomorrow.</p>}
          {error && <p className="error">{error}</p>}
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <button className="btn btn-primary" onClick={() => router.push("/call")} disabled={!me?.canStartSession}>
              Call Krishna
            </button>
            <button className="btn btn-secondary" onClick={() => router.push("/paywall")}>
              Upgrade Plan
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
