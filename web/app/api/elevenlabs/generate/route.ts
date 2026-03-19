import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const { prompt, duration_seconds, stemType } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    // Wrap the user's prompt with strong loop guidance
    const loopPrompt = `Seamless looping musical loop. ${prompt}. This must be a perfect loop that repeats seamlessly with no silence at the start or end.`;

    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: loopPrompt,
        duration_seconds: duration_seconds || 8,
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
    const key = `generated/${stemType || "audio"}/${uuid()}.mp3`;
    const audioUrl = await uploadToR2(key, audioBuffer, "audio/mpeg");

    return NextResponse.json({ audioUrl });
  } catch (err: any) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: "Generation failed", details: err.message },
      { status: 500 }
    );
  }
}
