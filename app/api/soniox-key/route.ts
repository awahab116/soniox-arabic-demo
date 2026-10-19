import { NextResponse } from "next/server";

// Never cache: every click on "Start" needs a fresh temporary key.
export const dynamic = "force-dynamic";

const SONIOX_TEMP_KEY_URL = "https://api.soniox.com/v1/auth/temporary-api-key";

/**
 * Exchanges the server-side SONIOX_API_KEY for a short-lived key the browser
 * can use to open the Soniox realtime WebSocket. The real key never leaves the server.
 */
export async function POST() {
  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SONIOX_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const res = await fetch(SONIOX_TEMP_KEY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usage_type: "transcribe_websocket",
      // Key only needs to live long enough to open the WebSocket.
      expires_in_seconds: 60,
      single_use: true,
      // Caps how long one session can run (and bill) if a tab is left open.
      max_session_duration_seconds: Number(process.env.SONIOX_MAX_SESSION_SECONDS ?? 900),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[soniox-key] Soniox returned", res.status, detail);
    return NextResponse.json(
      { error: `Soniox temporary key request failed (${res.status}).` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { api_key: string; expires_at: string };
  return NextResponse.json({
    apiKey: data.api_key,
    expiresAt: data.expires_at,
    model: process.env.SONIOX_MODEL || "stt-rt-v5",
  });
}
