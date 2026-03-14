"use client";
import { ListenMode } from "@/lib/audio-engine";

interface Props {
  mode: ListenMode;
  onChange: (mode: ListenMode) => void;
}

const modes: { value: ListenMode; label: string }[] = [
  { value: "solo", label: "My Track" },
  { value: "master", label: "Master" },
  { value: "overlay", label: "Both" },
];

export default function ListenModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition
            ${mode === m.value ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
