"use client";
import { StemType } from "@/lib/types";
import { INSTRUMENT_CONFIGS } from "@/lib/instrument-config";
import { STEM_TYPES } from "@/lib/constants";

interface Props {
  active: StemType;
  onChange: (stem: StemType) => void;
}

export default function InstrumentNav({ active, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "0 24px", flexShrink: 0 }}>
      {STEM_TYPES.map((stem) => {
        const config = INSTRUMENT_CONFIGS[stem];
        const isActive = active === stem;
        return (
          <button
            key={stem}
            onClick={() => onChange(stem)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: `1.5px solid ${isActive ? config.color : "rgba(232,226,217,0.06)"}`,
              background: isActive ? `${config.color}20` : "transparent",
              color: isActive ? config.color : "#5E584E",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
