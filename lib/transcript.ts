import type { Token } from "@soniox/speech-to-text-web";

// With endpoint detection on, Soniox emits an "<end>" token when the speaker pauses.
// We use it to split the transcript into utterance segments.
const END_TOKEN = "<end>";

export type Segment = {
  id: number;
  startMs: number;
  text: string;
  closed: boolean;
};

export type Pending = {
  startMs: number;
  text: string;
} | null;

/**
 * Applies one Soniox response to the transcript.
 * Final tokens are appended once (they never change); non-final tokens are
 * provisional and replaced on every response, so they're returned separately.
 */
export function applyTokens(prev: Segment[], tokens: Token[]): { segments: Segment[]; pending: Pending } {
  const segments = prev.slice();
  let pendingText = "";
  let pendingStart: number | null = null;

  for (const token of tokens) {
    if (!token.is_final) {
      if (token.text === END_TOKEN) continue;
      if (pendingStart === null) pendingStart = token.start_ms ?? 0;
      pendingText += token.text;
      continue;
    }

    const last = segments[segments.length - 1];
    const open = last && !last.closed ? last : null;

    if (token.text === END_TOKEN) {
      if (open) segments[segments.length - 1] = { ...open, closed: true };
      continue;
    }

    if (open) {
      segments[segments.length - 1] = { ...open, text: open.text + token.text };
    } else {
      // Don't start a new line with the space that separates it from the previous one.
      const text = token.text.trimStart();
      if (!text) continue;
      segments.push({
        id: segments.length,
        startMs: token.start_ms ?? 0,
        text,
        closed: false,
      });
    }
  }

  return {
    segments,
    pending: pendingText.trim() ? { startMs: pendingStart ?? 0, text: pendingText } : null,
  };
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function countWords(segments: Segment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
}

export function toPlainText(segments: Segment[]): string {
  return segments.map((s) => `[${formatClock(s.startMs)}] ${s.text.trim()}`).join("\n");
}
