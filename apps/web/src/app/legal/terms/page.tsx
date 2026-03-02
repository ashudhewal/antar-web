import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="screen" style={{ gap: "1rem" }}>
      <Link href="/profile">← Back</Link>
      <h1>Terms of Service</h1>
      <p>
        Antar is an AI devotional companion. It is not a real deity and not a substitute for medical, legal, financial, or mental
        health professionals.
      </p>
      <p>
        By using Antar, you agree not to misuse the platform, reverse engineer protected APIs, or violate payment terms.
      </p>
    </main>
  );
}
