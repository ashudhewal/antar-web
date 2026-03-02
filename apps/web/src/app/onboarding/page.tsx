"use client";

import { setOnboardingSeen } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setOnboardingSeen();
      router.push("/login");
    }, 1400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="screen" style={{ justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ fontSize: "4rem", margin: 0 }}>Antar</h1>
      <p className="note">The AI companion who cares</p>
    </main>
  );
}
