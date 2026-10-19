# Arabic Live Transcription (Soniox POC)

Real-time Arabic speech-to-text in the browser using [Soniox](https://soniox.com). Transcription only — no LLM.

## How it works

```
Browser ──POST /api/soniox-key──▶ Next.js API route (holds SONIOX_API_KEY)
        ◀── temporary key (60s, single use) ──
Browser ──mic audio over WSS──▶ Soniox realtime API
        ◀── tokens (final + provisional) ──
```

- `app/api/soniox-key/route.ts` — exchanges the real key for a short-lived, single-use key. The real key never reaches the browser.
- `app/page.tsx` — the app: header, transcript card, floating record dock. Uses `@soniox/speech-to-text-web` to stream the mic to Soniox.
- `lib/transcript.ts` — turns Soniox tokens into timestamped segments (each pause / `<end>` token starts a new segment).
- `components/` — `RecordButton`, `Waveform` (live mic level), `TranscriptView` (RTL segments, provisional text in grey, live caret).

UI features: live waveform + session timer, timestamped segments, word/segment count, text size control,
copy / download `.txt`, light & dark mode, mobile layout, and **Space** to start/stop.

Soniox settings: model `stt-rt-v5`, `languageHints: ["ar"]`, endpoint detection on (same as `STTSoniox.py` in interviewer-llm).

## Run locally

```bash
cp .env.example .env.local   # then put your key in SONIOX_API_KEY
npm install
npm run dev
```

Open http://localhost:3000, click **Start**, allow the microphone, and speak Arabic.

## Deploy to Vercel

1. Push this folder to a new Git repo (GitHub/GitLab).
2. In Vercel: **Add New → Project**, import the repo (framework auto-detected as Next.js).
3. **Settings → Environment Variables**: add `SONIOX_API_KEY` (and optionally `SONIOX_MODEL`, `SONIOX_MAX_SESSION_SECONDS`).
   Do **not** prefix it with `NEXT_PUBLIC_`.
4. Deploy. Vercel serves over HTTPS, which browsers require for microphone access.

## Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `SONIOX_API_KEY` | yes | — | Soniox API key (server-side only) |
| `SONIOX_MODEL` | no | `stt-rt-v5` | Soniox realtime model |
| `SONIOX_MAX_SESSION_SECONDS` | no | `900` | Max length of one transcription session (caps cost if a tab is left open) |

## Notes

- `/api/soniox-key` is public: anyone with the URL can start a session on your Soniox account. Fine for a demo; add a passcode or Vercel password protection before sharing widely.
- Requires Node 20+ (`.nvmrc` included — run `nvm use 20`). Tailwind 4.3's native binding doesn't install on Node 18.
