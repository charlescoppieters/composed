"use client";
import { InstrumentMode } from "@/lib/types";

interface Props {
  active: InstrumentMode;
  onChange: (mode: InstrumentMode) => void;
}

const MODES: { value: InstrumentMode; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "sequence", label: "Step Sequence" },
  { value: "live", label: "Live" },
];

export default function ModeNav({ active, onChange }: Props) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid rgba(232,226,217,0.06)", padding: "0 24px", flexShrink: 0 }}>
      {MODES.map((mode) => {
        const isActive = active === mode.value;
        return (
          <button
            key={mode.value}
            onClick={() => onChange(mode.value)}
            style={{
              padding: "12px 24px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: "transparent",
              borderBottom: `2px solid ${isActive ? "#CFA24B" : "transparent"}`,
              color: isActive ? "#CFA24B" : "#5E584E",
              transition: "all 0.15s",
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
