"use client";

import { Mic, Square } from "lucide-react";

type Props = {
  recording: boolean;
  busy: boolean;
  onClick: () => void;
};

export function RecordButton({ recording, busy, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={recording ? "Stop transcription" : "Start transcription"}
      className={`relative grid size-14 shrink-0 place-items-center rounded-full shadow-lg transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-wait ${
        recording ? "bg-danger text-white hover:brightness-110" : "bg-accent text-accent-fg hover:brightness-110"
      }`}
    >
      {recording && !busy && (
        <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden />
      )}
      {busy && (
        <span
          className="absolute inset-[-4px] animate-spin rounded-full border-2 border-transparent border-t-accent"
          aria-hidden
        />
      )}
      {recording ? (
        <Square className="relative size-5" fill="currentColor" strokeWidth={0} />
      ) : (
        <Mic className="relative size-6" strokeWidth={2.2} />
      )}
    </button>
  );
}
