"use client";
import { useState } from "react";
import { RoomSettings, StemType } from "@/lib/types";

const STYLES = [
  { value: "", label: "No preference" },
  { value: "soulful R&B", label: "Soulful R&B" },
  { value: "ethereal pop", label: "Ethereal pop" },
  { value: "hip-hop", label: "Hip-hop" },
  { value: "indie folk", label: "Indie folk" },
  { value: "electronic", label: "Electronic" },
  { value: "jazz", label: "Jazz" },
  { value: "gospel choir", label: "Gospel choir" },
  { value: "lo-fi", label: "Lo-fi" },
];

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

type Status = "idle" | "generating" | "ready";

export default function TextToVocal({ settings, roomCode, onPush }: Props) {
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loopDuration = Math.round((settings.barCount * 4 * 60) / settings.bpm);

  const generate = async () => {
    if (!lyrics.trim()) return;
    setStatus("generating");
    setError(null);
    setPreviewUrl(null);

    try {
      const res = await fetch("/api/text-to-vocal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: lyrics.trim(),
          style,
          key: settings.key,
          scale: settings.scale,
          bpm: settings.bpm,
          barCount: settings.barCount,
          roomCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Generation failed");
      }

      const { url } = await res.json();
      setPreviewUrl(url);
      setStatus("ready");
    } catch (err: any) {
      setError(err.message);
      setStatus("idle");
    }
  };

  const push = () => {
    if (!previewUrl) return;
    onPush(previewUrl, "AI Vocal", "vocals");
    setPreviewUrl(null);
    setLyrics("");
    setStatus("idle");
  };

  const regenerate = () => {
    setPreviewUrl(null);
    setStatus("idle");
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Write lyrics — generates a {loopDuration}s vocal in {settings.key} {settings.scale} at{" "}
        {settings.bpm} BPM
      </p>

      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder={`Write your lyrics for ${settings.barCount} bars here...`}
        rows={5}
        disabled={status === "generating"}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white
                   placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500
                   disabled:opacity-50 transition"
      />

      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm shrink-0">Style</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          disabled={status === "generating"}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                     focus:outline-none focus:border-purple-500 disabled:opacity-50"
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      )}

      {status === "generating" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center gap-3">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1.5 h-6 bg-purple-500 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <p className="text-gray-400 text-sm">Generating {loopDuration}s vocal...</p>
          <p className="text-gray-600 text-xs">This can take up to 30 seconds</p>
        </div>
      )}

      {status === "ready" && previewUrl && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Preview</p>
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-3">
            <button
              onClick={regenerate}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
            >
              Regenerate
            </button>
            <button
              onClick={push}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-semibold transition"
            >
              Push to Master
            </button>
          </div>
        </div>
      )}

      {status === "idle" && (
        <button
          onClick={generate}
          disabled={!lyrics.trim()}
          className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     disabled:text-gray-500 rounded-lg text-sm font-semibold transition"
        >
          Generate vocal
        </button>
      )}

      <p className="text-gray-600 text-xs text-center">
        Powered by ElevenLabs Music · {settings.barCount} bars · {settings.key} {settings.scale}
      </p>
    </div>
  );
}
