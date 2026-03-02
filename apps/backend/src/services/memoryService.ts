import { env } from "../config/env.js";
import { BHAGAVAD_GITA_SHLOKAS, ShlokaEntry } from "../constants/shlokas.js";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { SessionSummary, SessionTurn, UserMemory } from "../types/domain.js";
import { nowIso } from "../utils/time.js";

interface SummaryResult {
  summaryShort: string;
  factsExtracted: string[];
  topics: string[];
}

interface MemorySeed {
  memoryContext: string;
  openingShloka: ShlokaEntry;
  openingScript: string;
}

export class MemoryService {
  constructor(private readonly repo: FirestoreRepository) {}

  async buildSessionMemorySeed(uid: string, name?: string | null): Promise<MemorySeed> {
    const memory = await this.repo.getOrCreateUserMemory(uid);
    const recentSummaries = await this.repo.listRecentSessionSummaries(uid, 5);
    const openingShloka = this.chooseOpeningShloka(memory.lastShlokaIds);

    await this.repo.updateUserMemory(uid, {
      lastShlokaIds: [...memory.lastShlokaIds, openingShloka.id].slice(-6)
    });

    const memoryContext = this.composeMemoryContext(memory, recentSummaries, name ?? null);
    const openingScript = [
      `आज का गीता श्लोक (${openingShloka.reference}) सुनो:`,
      openingShloka.devanagari,
      `सरल अर्थ: ${openingShloka.hindiMeaning}`,
      "अब प्रेम और धैर्य से अपनी बात कहो, मैं सुन रहा हूँ।"
    ].join("\n");

    return {
      memoryContext,
      openingShloka,
      openingScript
    };
  }

  async finalizeSessionMemory(uid: string, sessionId: string): Promise<SessionSummary | null> {
    const existing = await this.repo.getSessionSummary(sessionId);
    if (existing) return existing;

    const turns = await this.repo.listSessionTurns(sessionId, 120);
    if (turns.length === 0) return null;

    const summary = await this.summarizeTurns(turns);
    const now = nowIso();
    const summaryRecord: SessionSummary = {
      sessionId,
      uid,
      summaryShort: summary.summaryShort,
      factsExtracted: summary.factsExtracted,
      topics: summary.topics,
      createdAt: now,
      updatedAt: now
    };

    await this.repo.upsertSessionSummary(summaryRecord);
    await this.mergeUserMemory(uid, summaryRecord);
    return summaryRecord;
  }

  private composeMemoryContext(memory: UserMemory, recent: SessionSummary[], name: string | null): string {
    const lines: string[] = [];
    if (name) lines.push(`User name: ${name}`);
    if (memory.profileFacts.length > 0) {
      lines.push(`Profile facts: ${memory.profileFacts.slice(0, 8).join("; ")}`);
    }
    if (memory.stableFacts.length > 0) {
      lines.push(`Stable memory: ${memory.stableFacts.slice(0, 10).join("; ")}`);
    }
    if (recent.length > 0) {
      const compactRecent = recent
        .slice(0, 3)
        .map((s) => `${s.summaryShort}`)
        .join(" | ");
      lines.push(`Recent conversation memory: ${compactRecent}`);
    }
    if (lines.length === 0) {
      lines.push("No prior memory found. Be warm and ask one personal check-in question.");
    }
    return lines.join("\n");
  }

  private chooseOpeningShloka(lastShlokaIds: string[]): ShlokaEntry {
    const recent = new Set(lastShlokaIds.slice(-5));
    const candidates = BHAGAVAD_GITA_SHLOKAS.filter((row) => !recent.has(row.id));
    const source = candidates.length > 0 ? candidates : BHAGAVAD_GITA_SHLOKAS;
    const idx = Math.floor(Math.random() * source.length);
    return source[idx];
  }

  private async summarizeTurns(turns: SessionTurn[]): Promise<SummaryResult> {
    const fallback = this.localSummaryFallback(turns);
    if (!env.OPENAI_API_KEY) return fallback;

    const compactTurns = turns
      .slice(-80)
      .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
      .join("\n")
      .slice(-12000);

    const body = {
      model: env.OPENAI_SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You summarize devotional call transcripts for memory.\n" +
            "Return strict JSON with keys: summaryShort (string), factsExtracted (string[]), topics (string[]).\n" +
            "Keep summaryShort under 80 words. Facts must be durable and safe."
        },
        {
          role: "user",
          content: compactTurns
        }
      ]
    };

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) return fallback;
      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return fallback;
      const parsed = JSON.parse(content) as Partial<SummaryResult>;
      const summaryShort = (parsed.summaryShort ?? "").toString().trim();
      const factsExtracted = Array.isArray(parsed.factsExtracted)
        ? parsed.factsExtracted.map((x) => String(x)).filter(Boolean).slice(0, 10)
        : [];
      const topics = Array.isArray(parsed.topics)
        ? parsed.topics.map((x) => String(x)).filter(Boolean).slice(0, 8)
        : [];
      if (!summaryShort) return fallback;
      return {
        summaryShort,
        factsExtracted,
        topics
      };
    } catch {
      return fallback;
    }
  }

  private localSummaryFallback(turns: SessionTurn[]): SummaryResult {
    const recent = turns.slice(-8).map((t) => `${t.role}: ${t.text}`).join(" ");
    const cleaned = recent.replace(/\s+/g, " ").trim().slice(0, 320);
    return {
      summaryShort: cleaned || "User had a devotional conversation and sought calm guidance.",
      factsExtracted: [],
      topics: []
    };
  }

  private async mergeUserMemory(uid: string, summary: SessionSummary): Promise<void> {
    const memory = await this.repo.getOrCreateUserMemory(uid);
    const stable = [...memory.stableFacts, ...summary.factsExtracted]
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(-20);

    const episodicRecent = [
      {
        sessionId: summary.sessionId,
        summaryShort: summary.summaryShort,
        createdAt: summary.createdAt
      },
      ...memory.episodicRecent
    ].slice(0, 6);

    await this.repo.updateUserMemory(uid, {
      stableFacts: stable,
      episodicRecent
    });
  }
}
