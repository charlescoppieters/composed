import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const roomCode = formData.get("roomCode") as string;

    if (!file || !roomCode) {
      return NextResponse.json({ error: "Missing file or roomCode" }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const apiKey = process.env.ELEVENLABS_API_KEY;

    let outputBuffer: Buffer;

    let isolated = false;

    if (!apiKey || apiKey === "your_elevenlabs_key") {
      console.log("[autotune] No ElevenLabs key — skipping isolation");
      outputBuffer = inputBuffer;
    } else {
      console.log("[autotune] Calling ElevenLabs audio isolation...");
      const elForm = new FormData();
      elForm.append(
        "audio",
        new Blob([inputBuffer], { type: "audio/wav" }),
        "vocals.wav"
      );

      const elRes = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: elForm,
      });

      if (elRes.ok) {
        outputBuffer = Buffer.from(await elRes.arrayBuffer());
        isolated = true;
        console.log("[autotune] ElevenLabs isolation succeeded");
      } else {
        const errText = await elRes.text();
        console.error(`[autotune] ElevenLabs failed (${elRes.status}):`, errText);
        outputBuffer = inputBuffer;
      }
    }

    const key = `rooms/${roomCode}/${uuid()}.wav`;
    const url = await uploadToR2(key, outputBuffer, "audio/wav");
    return NextResponse.json({ url, isolated });
  } catch (err: any) {
    console.error("Autotune error:", err);
    return NextResponse.json(
      { error: "Processing failed", details: err.message },
      { status: 500 }
    );
  }
}
