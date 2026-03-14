"use client";
import { RoomSettings } from "../../shared/types";
import { MUSICAL_KEYS, SCALES, BAR_COUNTS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onUpdateSettings: (s: Partial<RoomSettings>) => void;
}

export default function MasterControls({ settings, isPlaying, onStart, onStop, onUpdateSettings }: Props) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={isPlaying ? onStop : onStart}
        className={`px-6 py-2 rounded-lg font-semibold transition
          ${isPlaying ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"}`}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">BPM</span>
        <input
          type="number"
          min={60}
          max={200}
          value={settings.bpm}
          onChange={(e) => onUpdateSettings({ bpm: Number(e.target.value) })}
          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center font-mono"
        />
      </div>

      <div className="flex items-center gap-1 text-sm">
        <select
          value={settings.key}
          onChange={(e) => onUpdateSettings({ key: e.target.value as any })}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
        >
          {MUSICAL_KEYS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select
          value={settings.scale}
          onChange={(e) => onUpdateSettings({ scale: e.target.value as any })}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
        >
          {SCALES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex gap-1">
        {BAR_COUNTS.map((b) => (
          <button
            key={b}
            onClick={() => onUpdateSettings({ barCount: b })}
            className={`px-3 py-1 rounded text-sm font-mono transition
              ${settings.barCount === b ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
