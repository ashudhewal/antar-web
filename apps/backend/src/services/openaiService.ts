import { env } from "../config/env.js";
import { KRISHNA_PERSONA_INSTRUCTIONS } from "../constants/persona.js";
import { AppError } from "../utils/errors.js";

interface RealtimeSessionRequest {
  languageMode: "hinglish" | "english";
  memoryContext?: string;
}

interface RealtimeCallAnswerRequest {
  offerSdp: string;
  languageMode: "hinglish" | "english";
  memoryContext?: string;
}

interface RealtimeSessionResponse {
  clientSecret: string;
  realtimeSessionId: string | null;
  model: string;
}

export class OpenAiService {
  private realtimeModelCandidates(): string[] {
    return [env.OPENAI_REALTIME_MODEL, "gpt-realtime", "gpt-4o-realtime-preview"]
      .filter((value, index, self): value is string => Boolean(value) && self.indexOf(value) === index);
  }

  private buildInstructions(languageMode: "hinglish" | "english", memoryContext?: string): string {
    const personaSuffix =
      languageMode === "hinglish"
        ? "Default language: Hindi (Devanagari). Keep words simple, devotional, and conversational."
        : "Respond in clear English only.";

    const noiseHandlingSuffix =
      "Ignore ambient sounds and non-speech noise (fan, traffic, keyboard, background voices). " +
      "Only respond when the user clearly addresses you.";

    const memorySuffix = memoryContext
      ? `Known user memory context (trusted notes):\n${memoryContext}\nUse this gently for continuity.`
      : "No prior memory available. Ask one short check-in question.";

    return `${KRISHNA_PERSONA_INSTRUCTIONS}\n${personaSuffix}\n${noiseHandlingSuffix}\n${memorySuffix}`;
  }

  async createRealtimeSession(input: RealtimeSessionRequest): Promise<RealtimeSessionResponse> {
    if (!env.OPENAI_API_KEY) {
      throw new AppError(503, "OPENAI_NOT_CONFIGURED", "OpenAI API key is missing");
    }

    const instructions = this.buildInstructions(input.languageMode, input.memoryContext);
    const transcriptionLanguage = input.languageMode === "hinglish" ? "hi" : "en";
    const candidates = this.realtimeModelCandidates();

    let lastErrorText = "unknown_openai_error";

    for (const model of candidates) {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          voice: env.OPENAI_REALTIME_VOICE,
          instructions,
          modalities: ["audio", "text"],
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
            threshold: 0.32,
            prefix_padding_ms: 420,
            silence_duration_ms: 900
          },
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_noise_reduction: {
            type: "near_field"
          },
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: transcriptionLanguage
          }
        })
      });

      if (response.ok) {
        const data = (await response.json()) as {
          id?: string;
          client_secret?: {
            value?: string;
          };
        };

        const clientSecret = data.client_secret?.value;
        if (!clientSecret) {
          throw new AppError(502, "OPENAI_SESSION_INVALID", "OpenAI response missing client secret");
        }

        return {
          clientSecret,
          realtimeSessionId: data.id ?? null,
          model
        };
      }

      const text = await response.text();
      lastErrorText = text;
      const modelIssue = response.status === 400 || response.status === 404;
      if (!modelIssue || model === candidates[candidates.length - 1]) {
        throw new AppError(502, "OPENAI_SESSION_FAILED", `Failed to create realtime session: ${text}`);
      }
    }

    throw new AppError(502, "OPENAI_SESSION_FAILED", `Failed to create realtime session: ${lastErrorText}`);
  }

  async createRealtimeCallAnswer(input: RealtimeCallAnswerRequest): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      throw new AppError(503, "OPENAI_NOT_CONFIGURED", "OpenAI API key is missing");
    }

    const instructions = this.buildInstructions(input.languageMode, input.memoryContext);
    const transcriptionLanguage = input.languageMode === "hinglish" ? "hi" : "en";
    const candidates = this.realtimeModelCandidates();
    let lastErrorText = "unknown_openai_error";
    let lastStatus = 0;

    for (const model of candidates) {
      const form = new FormData();
      form.append("sdp", input.offerSdp);
      form.append(
        "session",
        JSON.stringify({
          type: "realtime",
          model,
          instructions,
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                create_response: true,
                interrupt_response: true,
                threshold: 0.32,
                prefix_padding_ms: 420,
                silence_duration_ms: 900
              },
              noise_reduction: {
                type: "near_field"
              },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: transcriptionLanguage
              }
            },
            output: {
              voice: env.OPENAI_REALTIME_VOICE
            }
          }
        })
      );

      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: form
      });

      if (response.ok) {
        return response.text();
      }

      const text = await response.text();
      lastErrorText = text;
      lastStatus = response.status;

      const isModelIssue = response.status === 400 || response.status === 404;
      const isLast = model === candidates[candidates.length - 1];
      if (!isModelIssue || isLast) {
        throw new AppError(
          502,
          "OPENAI_CALLS_FAILED",
          `Failed to create realtime call (model=${model}, status=${response.status}): ${text}`
        );
      }
    }

    throw new AppError(
      502,
      "OPENAI_CALLS_FAILED",
      `Failed to create realtime call after fallbacks (status=${lastStatus}): ${lastErrorText}`
    );
  }
}
