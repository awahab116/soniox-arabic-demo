"use client";

import { Mic } from "lucide-react";
import { formatClock, type Pending, type Segment } from "@/lib/transcript";

type Props = {
  segments: Segment[];
  pending: Pending;
  live: boolean;
  fontSize: number;
};

export function TranscriptView({ segments, pending, live, fontSize }: Props) {
  const last = segments[segments.length - 1];
  const open = last && !last.closed ? last : null;
  const closed = open ? segments.slice(0, -1) : segments;

  if (segments.length === 0 && !pending) {
    return <EmptyState live={live} />;
  }

  return (
    <ol dir="rtl" lang="ar" className="flex flex-col gap-1" style={{ fontSize }}>
      {closed.map((s) => (
        <Row key={s.id} startMs={s.startMs}>
          {s.text}
        </Row>
      ))}

      {(open || pending) && (
        <Row startMs={open?.startMs ?? pending?.startMs ?? 0} active={live}>
          {open?.text}
          {pending && <span className="text-partial">{pending.text}</span>}
          {live && <span className="caret" aria-hidden />}
        </Row>
      )}
    </ol>
  );
}

function Row({
  startMs,
  active = false,
  children,
}: {
  startMs: number;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`grid grid-cols-[3.5rem_1fr] items-baseline gap-3 rounded-lg px-3 py-2 transition-colors sm:gap-4 ${
        active ? "bg-accent-soft" : "hover:bg-surface-2"
      }`}
    >
      <span
        dir="ltr"
        className={`text-start font-mono text-xs tabular-nums ${active ? "text-accent" : "text-muted"}`}
      >
        {formatClock(startMs)}
      </span>
      <p className="font-arabic leading-[1.9] text-pretty">{children}</p>
    </li>
  );
}

function EmptyState({ live }: { live: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Mic className="size-6" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p dir="rtl" lang="ar" className="font-arabic text-2xl">
          {live ? "تحدث الآن، نحن نستمع…" : "سيظهر النص هنا مباشرة"}
        </p>
        <p className="text-sm text-muted">
          {live
            ? "Start speaking Arabic — words appear as you talk."
            : "Press the mic button or hit Space to start live transcription."}
        </p>
      </div>
    </div>
  );
}
