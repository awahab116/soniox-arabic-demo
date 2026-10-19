"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Check, CircleAlert, Copy, Download, Minus, Plus, Trash2, X } from "lucide-react";
// Type-only import: the SDK touches `window` on load, so the runtime module is
// imported lazily in start() to keep server pre-rendering working.
import type { SonioxClient, RecorderState } from "@soniox/speech-to-text-web";
import { RecordButton } from "@/components/RecordButton";
import { TranscriptView } from "@/components/TranscriptView";
import { Waveform } from "@/components/Waveform";
import { applyTokens, countWords, formatClock, toPlainText, type Pending, type Segment } from "@/lib/transcript";

type KeyResponse = { apiKey: string; model: string } | { error: string };

const ACTIVE_STATES: RecorderState[] = ["RequestingMedia", "OpeningWebSocket", "Running", "FinishingProcessing"];
const FONT_SIZES = [18, 22, 26, 30, 36];

const STATUS: Record<RecorderState, { label: string; tone: "idle" | "busy" | "live" | "error" }> = {
  Init: { label: "Ready", tone: "idle" },
  RequestingMedia: { label: "Waiting for mic", tone: "busy" },
  OpeningWebSocket: { label: "Connecting", tone: "busy" },
  Running: { label: "Live", tone: "live" },
  FinishingProcessing: { label: "Finishing", tone: "busy" },
  Finished: { label: "Ready", tone: "idle" },
  Error: { label: "Error", tone: "error" },
  Canceled: { label: "Ready", tone: "idle" },
};

export default function Home() {
  const clientRef = useRef<SonioxClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runningSinceRef = useRef<number | null>(null);
  // Source of truth for Soniox callbacks, which fire outside React's render cycle.
  const segmentsRef = useRef<Segment[]>([]);

  const [state, setState] = useState<RecorderState>("Init");
  const [starting, setStarting] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [model, setModel] = useState("stt-rt-v5");
  const [fontIdx, setFontIdx] = useState(1);
  const [copied, setCopied] = useState(false);

  const isActive = ACTIVE_STATES.includes(state);
  const isLive = state === "Running";
  const busy = starting || state === "RequestingMedia" || state === "OpeningWebSocket" || state === "FinishingProcessing";
  const status = starting && !isActive ? STATUS.OpeningWebSocket : STATUS[state];
  const words = countWords(segments);
  const hasText = segments.length > 0;

  const releaseAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setAnalyser(null);
  }, []);

  // Close everything if the page is closed / component unmounts.
  useEffect(
    () => () => {
      clientRef.current?.cancel();
      releaseAudio();
    },
    [releaseAudio],
  );

  // Session timer.
  useEffect(() => {
    if (!isLive) return;
    runningSinceRef.current = Date.now() - elapsedMs;
    const id = setInterval(() => setElapsedMs(Date.now() - (runningSinceRef.current ?? Date.now())), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only restart the timer when going live
  }, [isLive]);

  // Follow the newest text, unless the user scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [segments, pending]);

  const start = useCallback(async () => {
    setError(null);
    setPending(null);
    setStarting(true);

    try {
      // 1. Mic first, so the permission prompt shows immediately.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const node = audioCtx.createAnalyser();
      node.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(node);
      audioCtxRef.current = audioCtx;
      setAnalyser(node);

      // 2. Short-lived Soniox key from our API route (real key stays on the server).
      const res = await fetch("/api/soniox-key", { method: "POST" });
      const data = (await res.json()) as KeyResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Key request failed (${res.status})`);
      }
      setModel(data.model);

      // 3. Stream the mic straight to Soniox.
      const { SonioxClient } = await import("@soniox/speech-to-text-web");
      const client = new SonioxClient({
        apiKey: data.apiKey,
        keepAlive: true,
        onStateChange: ({ newState }) => setState(newState),
        onPartialResult: (result) => {
          const next = applyTokens(segmentsRef.current, result.tokens);
          segmentsRef.current = next.segments;
          setSegments(next.segments);
          setPending(next.pending);
        },
        onFinished: () => {
          setPending(null);
          releaseAudio();
        },
        onError: (errStatus, message, errorCode) => {
          console.error("[soniox]", errStatus, message, errorCode);
          setError(friendlyError(errStatus, message));
          setPending(null);
          releaseAudio();
        },
      });
      clientRef.current = client;

      // Each session restarts Soniox timestamps at 0, so start a fresh transcript.
      segmentsRef.current = [];
      setSegments([]);
      setElapsedMs(0);

      await client.start({
        model: data.model,
        stream,
        languageHints: ["ar"],
        enableEndpointDetection: true,
      });
    } catch (e) {
      releaseAudio();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? friendlyError("get_user_media_failed", "")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setStarting(false);
    }
  }, [releaseAudio]);

  const stop = useCallback(() => {
    clientRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (busy) return;
    if (isActive) stop();
    else void start();
  }, [busy, isActive, start, stop]);

  // Space bar toggles recording (unless typing / a button has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, input, textarea, [contenteditable]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  async function copy() {
    await navigator.clipboard.writeText(toPlainText(segments));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([toPlainText(segments)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clear() {
    segmentsRef.current = [];
    setSegments([]);
    setPending(null);
    setElapsedMs(0);
    setError(null);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
          <div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-fg">
            <AudioLines className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight">Arabic Live Transcription</h1>
            <p className="truncate text-xs text-muted">Real-time speech to text</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Chip>
              <span className="font-arabic text-[13px]">العربية</span>
            </Chip>
            <Chip>
              <span className="font-mono text-[11px]">{model}</span>
            </Chip>
          </div>
          <StatusPill label={status.label} tone={status.tone} />
        </div>
      </header>

      {/* Transcript card */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-5 pb-36">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
            <div className="flex min-w-0 flex-1 items-baseline gap-3">
              <h2 className="text-sm font-semibold">Transcript</h2>
              <p className="truncate text-xs text-muted tabular-nums">
                {words} {words === 1 ? "word" : "words"} · {segments.length}{" "}
                {segments.length === 1 ? "segment" : "segments"}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Smaller text"
                onClick={() => setFontIdx((i) => Math.max(0, i - 1))}
                disabled={fontIdx === 0}
              >
                <Minus />
              </IconButton>
              <span className="w-7 text-center text-xs font-medium text-muted select-none" aria-hidden>
                Aa
              </span>
              <IconButton
                label="Larger text"
                onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
                disabled={fontIdx === FONT_SIZES.length - 1}
              >
                <Plus />
              </IconButton>
              <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />
              <IconButton label={copied ? "Copied" : "Copy transcript"} onClick={copy} disabled={!hasText}>
                {copied ? <Check className="text-accent" /> : <Copy />}
              </IconButton>
              <IconButton label="Download .txt" onClick={download} disabled={!hasText}>
                <Download />
              </IconButton>
              <IconButton label="Clear transcript" onClick={clear} disabled={!hasText || isActive}>
                <Trash2 />
              </IconButton>
            </div>
          </div>

          <div ref={scrollRef} className="h-[calc(100dvh-19.5rem)] min-h-72 overflow-y-auto p-2 sm:p-3">
            <TranscriptView
              segments={segments}
              pending={pending}
              live={isLive}
              fontSize={FONT_SIZES[fontIdx]}
            />
          </div>
        </section>
      </main>

      {/* Floating record dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-4 pb-5">
        {error && (
          <div
            role="alert"
            className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border border-danger/30 bg-surface px-3.5 py-2.5 text-sm shadow-lg"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="text-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-border bg-surface/95 py-2 ps-5 pe-2 shadow-xl backdrop-blur">
          <span
            className={`w-12 font-mono text-sm tabular-nums ${isLive ? "text-foreground" : "text-muted"}`}
            aria-label="Elapsed time"
          >
            {formatClock(elapsedMs)}
          </span>
          <div className="hidden sm:block">
            <Waveform analyser={analyser} />
          </div>
          <RecordButton recording={isActive} busy={busy} onClick={toggle} />
        </div>
        <p className="pointer-events-auto hidden text-[11px] text-muted sm:block">
          Press <kbd className="rounded border border-border bg-surface px-1 font-mono">Space</kbd> to{" "}
          {isActive ? "stop" : "start"} · grey text is provisional
        </p>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-2.5 text-muted">
      {children}
    </span>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "idle" | "busy" | "live" | "error" }) {
  const styles = {
    idle: "text-muted bg-surface-2",
    busy: "text-accent bg-accent-soft",
    live: "text-danger bg-danger/10",
    error: "text-danger bg-danger/10",
  }[tone];
  const dot = {
    idle: "bg-muted",
    busy: "bg-accent animate-pulse",
    live: "bg-danger animate-pulse",
    error: "bg-danger",
  }[tone];
  return (
    <span
      aria-live="polite"
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${styles}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function friendlyError(status: string, message: string): string {
  switch (status) {
    case "get_user_media_failed":
      return "Microphone access was blocked. Allow the microphone in your browser and try again.";
    case "websocket_error":
      return "Lost the connection to Soniox. Check your network and press Start again.";
    default:
      return message || "Something went wrong. Press Start to try again.";
  }
}
