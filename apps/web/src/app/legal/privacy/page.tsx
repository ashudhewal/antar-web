import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="screen" style={{ gap: "1rem" }}>
      <Link href="/profile">← Back</Link>
      <h1>Privacy Policy</h1>
      <p>Antar collects account identifiers, usage duration, subscription metadata, and optional feedback to operate the service.</p>
      <p>
        Voice data is processed for realtime response generation. Transcript persistence is controlled by your preference.
      </p>
    </main>
  );
}
