import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const SAMPLES_ROOT = path.resolve(process.cwd(), "..", "samples");

const MIME: Record<string, string> = {
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  const filePath = path.join(SAMPLES_ROOT, ...segments);

  // Prevent directory traversal
  if (!filePath.startsWith(SAMPLES_ROOT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const data = await readFile(filePath);

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
