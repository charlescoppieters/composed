import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const { prompt, duration_seconds } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: Math.min(duration_seconds || 1, 5),
        prompt_influence: 0.3,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("ElevenLabs error:", res.status, errorText);
      const errorType =
        res.status === 401 ? "auth" :
        res.status === 402 || (res.status === 403 && /quota|credit|limit/i.test(errorText)) ? "credits" :
        res.status === 429 ? "rate_limit" :
        "server";
      return NextResponse.json(
        { error: `ElevenLabs API error (${res.status})`, errorType },
        { status: res.status }
      );
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const key = `sounds/${uuid()}.mp3`;
    const audioUrl = await uploadToR2(key, audioBuffer, "audio/mpeg");

    return NextResponse.json({ audioUrl });
  } catch (err: any) {
    console.error("Sound generation error:", err);
    return NextResponse.json(
      { error: "Sound generation failed", details: err.message },
      { status: 500 }
    );
  }
}
