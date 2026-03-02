"use client";

import { useAuth } from "@/contexts/auth";
import { backendApi } from "@/lib/api";
import { getLanguageMode } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const CRISIS_TERMS = ["kill myself", "suicide", "end my life", "want to die", "hurt myself"];

const isHighRisk = (text: string) => {
  const normalized = text.toLowerCase();
  return CRISIS_TERMS.some((term) => normalized.includes(term));
};

export default function CallPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [live, setLive] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcriptPreview, setTranscriptPreview] = useState("Connecting...");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const assistantBufferRef = useRef("");

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  const endCall = async (reason: "user_ended" | "quota" | "disconnect" | "error") => {
    try {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);

      const sid = sessionId;
      const elapsedSec = startedAtRef.current > 0 ? Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)) : 0;

      dcRef.current?.close();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      dcRef.current = null;
      pcRef.current = null;
      localStreamRef.current = null;

      setLive(false);
      if (sid) {
        await backendApi.usageFinish(sid, elapsedSec, reason);
        await backendApi.finalizeMemory(sid);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    return () => {
      void endCall("disconnect");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTurnSafe = async (role: "user" | "assistant", text: string) => {
    if (!sessionId || text.trim().length < 2) return;
    try {
      await backendApi.saveTurn(sessionId, role, text.trim().slice(0, 1400));
    } catch {
      // best effort only
    }
  };

  const handleEvent = async (raw: string) => {
    try {
      const event = JSON.parse(raw) as { type?: string; delta?: string; transcript?: string; item?: { transcript?: string } };
      const type = event.type || "";

      if (type === "session.created") {
        setTranscriptPreview("Krishna is listening...");
      }

      if (["response.output_text.delta", "response.text.delta", "response.audio_transcript.delta", "response.output_audio_transcript.delta"].includes(type)) {
        const delta = event.delta || "";
        if (delta) {
          assistantBufferRef.current += delta;
          setTranscriptPreview((prev) => `${prev}${delta}`.slice(-280));
        }
      }

      if (["conversation.item.input_audio_transcription.completed", "input_audio_transcription.completed"].includes(type)) {
        const transcript = (event.transcript || event.item?.transcript || "").trim();
        if (transcript) {
          setTranscriptPreview(`You: ${transcript}`);
          await saveTurnSafe("user", transcript);
        }
      }

      if (["response.done", "response.completed"].includes(type)) {
        const assistantText = assistantBufferRef.current.trim();
        assistantBufferRef.current = "";
        if (assistantText.length > 3) {
          await saveTurnSafe("assistant", assistantText);
          setTranscriptPreview("Krishna is listening...");
        }
      }
    } catch {
      // ignore malformed event
    }
  };

  const startCall = async () => {
    try {
      setError(null);
      setConnecting(true);

      const session = await backendApi.createSession(getLanguageMode());
      setSessionId(session.sessionId);
      setSecondsRemaining(session.secondsAllowed);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        const remote = event.streams[0];
        if (audioRef.current) {
          audioRef.current.srcObject = remote;
          void audioRef.current.play();
        }
      };

      const dc = pc.createDataChannel("oai-events", { ordered: true });
      dcRef.current = dc;
      dc.onmessage = (event) => {
        void handleEvent(String(event.data || ""));
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const answer = await backendApi.createWebRtcAnswer(session.sessionId, offer.sdp || "");
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer.answerSdp }));

      startedAtRef.current = Date.now();
      setLive(true);
      setConnecting(false);

      pingTimerRef.current = window.setInterval(() => {
        void backendApi.usagePing(session.sessionId, 30);
      }, 30_000);

      countdownRef.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((new Date(session.hardStopAt).getTime() - Date.now()) / 1000));
        setSecondsRemaining(left);
        if (left <= 0) {
          void endCall("quota").then(() => router.push("/paywall"));
        }
      }, 1000);
    } catch (e) {
      setError((e as Error).message);
      setConnecting(false);
      setLive(false);
    }
  };

  return (
    <>
      <video className="bg-video" autoPlay muted loop playsInline src="/assets/calling_bg_video.mp4" />
      <div className="video-overlay" />
      <main className="screen" style={{ gap: "1rem" }}>
        <audio ref={audioRef} autoPlay playsInline />
        <div className="row">
          <button className="btn btn-secondary" onClick={() => void endCall("user_ended").then(() => router.back())}>Back</button>
          <span className="badge">{live ? "live" : connecting ? "connecting" : "idle"}</span>
        </div>

        <h1 style={{ marginBottom: 0 }}>Krishna</h1>
        <h2 style={{ marginTop: 0 }}>{String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:{String(secondsRemaining % 60).padStart(2, "0")}</h2>
        <section className="panel" style={{ padding: "1rem" }}>
          <p>{transcriptPreview}</p>
          {isHighRisk(transcriptPreview) && (
            <p className="error">If you are in immediate danger, contact local emergency services now and reach out to a trusted person immediately.</p>
          )}
          {error && <p className="error">{error}</p>}
        </section>

        <div className="row" style={{ justifyContent: "space-evenly" }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setMuted((m) => {
                const next = !m;
                localStreamRef.current?.getAudioTracks().forEach((t) => {
                  t.enabled = !next;
                });
                return next;
              });
            }}
            disabled={!live}
          >
            {muted ? "Unmute" : "Mute"}
          </button>

          <button
            className="btn btn-primary"
            onClick={() => {
              if (live || connecting) {
                void endCall("user_ended").then(() => router.back());
              } else {
                void startCall();
              }
            }}
          >
            {live || connecting ? "End" : "Start"}
          </button>
        </div>
      </main>
    </>
  );
}
