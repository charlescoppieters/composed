import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { buildSamplePrompt } from "@/lib/elevenlabs";
import { RoomSettings } from "@/lib/types";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { query, settings, roomCode } = (await req.json()) as {
    query: string;
    settings: RoomSettings;
    roomCode: string;
  };

  const prompt = buildSamplePrompt(query, settings);

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: 2,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const key = `rooms/${roomCode}/samples/${uuid()}.mp3`;
  const url = await uploadToR2(key, audioBuffer, "audio/mpeg");

  return NextResponse.json({ url });
}
