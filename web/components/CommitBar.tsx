"use client";
import { RoomSettings } from "@/lib/types";

interface Props {
  settings: RoomSettings;
  hasContent: boolean;
  isCommitting: boolean;
  onClear: () => void;
  onCommit: () => void;
  commitLabel?: string;
}

export default function CommitBar({ settings, hasContent, isCommitting, onClear, onCommit, commitLabel = "Commit" }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      borderTop: "1px solid rgba(232,226,217,0.06)", paddingTop: 12,
    }}>
      <span style={{ color: "#5E584E", fontSize: 11, fontFamily: "var(--fm)" }}>
        {settings.bpm} BPM · {settings.barCount} bars
      </span>
      <div style={{ flex: 1 }} />
      {hasContent && (
        <button onClick={onClear} style={{
          padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
          background: "transparent", border: "1px solid rgba(232,226,217,0.06)", color: "#5E584E",
        }}>
          Clear
        </button>
      )}
      <button onClick={onCommit} disabled={isCommitting || !hasContent} style={{
        padding: "8px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700,
        cursor: hasContent && !isCommitting ? "pointer" : "default", border: "none",
        opacity: hasContent ? 1 : 0.3, background: "#7B9E84", color: "#0D0C0A",
      }}>
        {isCommitting ? "Committing..." : `⬆ ${commitLabel}`}
      </button>
    </div>
  );
}
