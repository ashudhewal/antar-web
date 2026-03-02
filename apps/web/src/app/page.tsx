"use client";

import { useAuth } from "@/contexts/auth";
import { getDisclaimerAccepted, getOnboardingSeen } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GatePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!getDisclaimerAccepted()) {
      router.replace("/disclaimer");
      return;
    }
    if (!getOnboardingSeen()) {
      router.replace("/onboarding");
      return;
    }
    router.replace(user ? "/home" : "/login");
  }, [loading, router, user]);

  return (
    <main className="screen" style={{ justifyContent: "center", alignItems: "center" }}>
      <h1>Loading Antar...</h1>
    </main>
  );
}
