import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const { lyrics, style, key, scale, bpm, barCount, roomCode } = await req.json();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "your_elevenlabs_key") {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 400 });
    }

    const loopDurationMs = Math.round(((barCount * 4 * 60) / bpm) * 1000);

    const globalStyles = [
      `${bpm} BPM`,
      `${key} ${scale} key`,
      "a cappella",
      "vocals only",
      "no instruments",
      "clear singer",
    ];
    if (style) globalStyles.push(style);

    const negativeStyles = [
      "drums",
      "bass",
      "guitar",
      "piano",
      "synth",
      "beat",
      "backing track",
      "instrumental",
      "music",
      "percussion",
    ];

    // Split lyrics into lines, cap each at 200 chars (API limit)
    const lines: string[] = lyrics
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map((l: string) => l.slice(0, 200));

    const body = {
      composition_plan: {
        positive_global_styles: globalStyles,
        negative_global_styles: negativeStyles,
        sections: [
          {
            section_name: "Main",
            duration_ms: Math.min(loopDurationMs, 120000),
            positive_local_styles: globalStyles,
            negative_local_styles: negativeStyles,
            lines,
          },
        ],
      },
      model_id: "music_v1",
      respect_sections_durations: true,
    };

    console.log("[text-to-vocal] Calling ElevenLabs Music API...", {
      loopDurationMs,
      bpm,
      key,
      scale,
      lines: lines.length,
    });

    const elRes = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!elRes.ok) {
      const errText = await elRes.text();
      console.error(`[text-to-vocal] ElevenLabs failed (${elRes.status}):`, errText);
      return NextResponse.json(
        { error: "Generation failed", details: errText },
        { status: 502 }
      );
    }

    const audioData = Buffer.from(await elRes.arrayBuffer());
    const r2Key = `rooms/${roomCode}/${uuid()}.mp3`;
    const url = await uploadToR2(r2Key, audioData, "audio/mpeg");

    console.log("[text-to-vocal] Success, uploaded to:", url);
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("[text-to-vocal] Error:", err);
    return NextResponse.json(
      { error: "Generation failed", details: err.message },
      { status: 500 }
    );
  }
}
