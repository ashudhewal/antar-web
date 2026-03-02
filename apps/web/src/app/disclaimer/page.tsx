"use client";

import { setDisclaimerAccepted } from "@/lib/storage";
import { useRouter } from "next/navigation";

export default function DisclaimerPage() {
  const router = useRouter();

  return (
    <main className="screen" style={{ justifyContent: "space-between" }}>
      <div>
        <h1 style={{ fontSize: "2.6rem", marginBottom: "0.75rem" }}>Antar</h1>
        <p style={{ lineHeight: 1.6 }}>
          This is an AI devotional companion inspired by Krishna and scriptures. It is not a real deity and not a substitute for
          medical, legal, financial, or mental health professionals.
        </p>
        <p className="error">If you are in danger or crisis, seek immediate local emergency help.</p>
      </div>
      <button
        className="btn btn-primary"
        onClick={() => {
          setDisclaimerAccepted();
          router.push("/onboarding");
        }}
      >
        I Understand
      </button>
    </main>
  );
}
