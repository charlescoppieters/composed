import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const roomCode = formData.get("roomCode") as string;

  if (!file || !roomCode) {
    return NextResponse.json({ error: "Missing file or roomCode" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "wav";
  const key = `rooms/${roomCode}/${uuid()}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type || "audio/wav");

  return NextResponse.json({ url });
}
