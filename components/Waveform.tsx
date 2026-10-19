"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 36;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const SAMPLE_EVERY_MS = 60;

/**
 * Scrolling level meter driven by the live microphone.
 * When there is no analyser (idle), it draws a flat row of dots.
 */
export function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const height = 32;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const levels = new Array<number>(BAR_COUNT).fill(0);
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;
    let lastSample = 0;
    let frame = 0;

    const draw = (now: number) => {
      if (analyser && buffer && now - lastSample >= SAMPLE_EVERY_MS) {
        lastSample = now;
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // Speech RMS is small; boost and soft-clip so normal talking fills the meter.
        levels.shift();
        levels.push(Math.min(1, Math.pow(rms * 4, 0.7)));
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(canvas).color;
      for (let i = 0; i < BAR_COUNT; i++) {
        const barHeight = Math.max(BAR_WIDTH, levels[i] * height);
        const x = i * (BAR_WIDTH + BAR_GAP);
        const y = (height - barHeight) / 2;
        ctx.globalAlpha = analyser ? 0.35 + 0.65 * (i / BAR_COUNT) : 0.35;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
        ctx.fill();
      }

      if (analyser) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return <canvas ref={canvasRef} aria-hidden className={analyser ? "text-accent" : "text-muted"} />;
}
