"use client";

import { useAuth } from "@/contexts/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, router, user]);

  const firebaseReady = useMemo(
    () =>
      Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
          process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
      ),
    []
  );

  return (
    <>
      <video className="bg-video" autoPlay muted loop playsInline src="/assets/login_bg_video.mp4" />
      <div className="video-overlay" />
      <main className="screen" style={{ justifyContent: "space-between" }}>
        <h1 style={{ textAlign: "center", marginTop: "0.5rem" }}>Antar</h1>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "2.2rem", marginBottom: "0.5rem" }}>The AI companion who cares</h2>
          <p className="note">Create account or log in with Gmail below</p>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            style={{ width: "100%" }}
            disabled={!firebaseReady || loading}
            onClick={async () => {
              try {
                setError(null);
                await signInWithGoogle();
              } catch (e) {
                setError((e as Error).message || "Google sign-in failed.");
              }
            }}
          >
            Continue with Gmail
          </button>
          {!firebaseReady && <p className="error">Firebase web config is missing in environment variables.</p>}
          {error && <p className="error">{error}</p>}
          <p className="note" style={{ textAlign: "center", marginTop: "1rem" }}>
            By continuing, you agree to Terms of service and Privacy policy.
          </p>
        </div>
      </main>
    </>
  );
}
