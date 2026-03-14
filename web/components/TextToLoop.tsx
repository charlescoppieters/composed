"use client";
import { useState } from "react";
import { RoomSettings, StemType } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

export default function TextToLoop({ settings, roomCode, onPreview, onPush }: Props) {
  const [query, setQuery] = useState("");
  const [stemType, setStemType] = useState<StemType>("drums");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setIsGenerating(true);
    setError("");
    setGeneratedUrl(null);

    try {
      const res = await fetch("/api/generate-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, settings, stemType, roomCode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { url } = await res.json();
      setGeneratedUrl(url);
      await onPreview(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Describe a loop and AI will generate it in{" "}
        <span className="text-white font-mono">{settings.key} {settings.scale}</span> at{" "}
        <span className="text-white font-mono">{settings.bpm} BPM</span>.
      </p>

      <div className="flex gap-2 flex-wrap">
        {STEM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setStemType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${stemType === t ? "text-white" : "bg-gray-900 text-gray-400"}`}
            style={stemType === t ? { backgroundColor: STEM_COLORS[t] } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder={`Describe your ${stemType} loop... (e.g., "funky boom bap with hi-hat rolls")`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !query.trim()}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     disabled:text-gray-500 rounded-lg font-semibold transition"
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {generatedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-400">Generated loop ready:</p>
          <div className="flex gap-2">
            <button
              onClick={() => onPreview(generatedUrl)}
              className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition"
            >
              Preview Again
            </button>
            <button
              onClick={() => handleGenerate()}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition"
            >
              Regenerate
            </button>
            <button
              onClick={() => onPush(generatedUrl, query.slice(0, 30), stemType)}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition"
            >
              Push to Master
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
