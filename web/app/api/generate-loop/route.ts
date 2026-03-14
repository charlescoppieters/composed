import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { buildLoopPrompt } from "@/lib/elevenlabs";
import { RoomSettings, StemType } from "@/lib/types";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { query, settings, stemType, roomCode } = (await req.json()) as {
    query: string;
    settings: RoomSettings;
    stemType: StemType;
    roomCode: string;
  };

  const prompt = buildLoopPrompt(query, settings, stemType);

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: (settings.barCount * 4 * 60) / settings.bpm,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "ElevenLabs generation failed", details: errorText },
      { status: 500 }
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const key = `rooms/${roomCode}/generated/${uuid()}.mp3`;
  const url = await uploadToR2(key, audioBuffer, "audio/mpeg");

  return NextResponse.json({ url, prompt });
}
