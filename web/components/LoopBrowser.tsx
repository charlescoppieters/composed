"use client";
import { useState, useEffect } from "react";
import { RoomSettings, StemType, LoopMeta } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

export default function LoopBrowser({ settings, onPreview, onPush }: Props) {
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<StemType | "all">("all");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/loops/index.json")
      .then((res) => res.json())
      .then(setLoops)
      .catch(console.error);
  }, []);

  const filtered = loops.filter((loop) => {
    if (filterType !== "all" && loop.stemType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        loop.name.toLowerCase().includes(q) ||
        loop.tags.some((t) => t.includes(q)) ||
        loop.stemType.includes(q)
      );
    }
    return true;
  });

  const handlePreview = async (loop: LoopMeta) => {
    setPreviewingId(loop.id);
    await onPreview(`/loops/${loop.filename}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search loops..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as StemType | "all")}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All types</option>
          {STEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((loop) => (
          <div
            key={loop.id}
            className="bg-gray-900 rounded-lg p-4 space-y-2 hover:bg-gray-800 transition"
            style={{ borderLeft: `3px solid ${STEM_COLORS[loop.stemType]}` }}
          >
            <div>
              <p className="font-medium text-sm">{loop.name}</p>
              <p className="text-xs text-gray-500">
                {loop.stemType} · {loop.bpm} BPM · {loop.key} {loop.scale}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePreview(loop)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition
                  ${previewingId === loop.id
                    ? "bg-yellow-600"
                    : "bg-gray-700 hover:bg-gray-600"}`}
              >
                {previewingId === loop.id ? "Previewing" : "Preview"}
              </button>
              <button
                onClick={() => onPush(`/loops/${loop.filename}`, loop.name, loop.stemType)}
                className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs font-medium transition"
              >
                Push
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-600 text-center py-8 text-sm">
          No loops found. Try a different search or filter.
        </p>
      )}
    </div>
  );
}
