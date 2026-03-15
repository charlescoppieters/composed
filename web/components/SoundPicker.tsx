"use client";
import { useState, useRef, useCallback } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string) => void;
  apiUrl?: string;
}

export default function SoundPicker({ isOpen, onClose, onSelect, apiUrl }: Props) {
  const [tab, setTab] = useState<"generate" | "library">("generate");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateSound = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/elevenlabs/sound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), duration_seconds: 1 }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const { audioUrl } = await res.json();
      setGeneratedUrl(audioUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 360, zIndex: 100,
      background: "#1A1917", borderLeft: "1px solid rgba(232,226,217,0.08)",
      display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(232,226,217,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#E8E2D9" }}>Sound Picker</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#5E584E", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "12px 20px", flexShrink: 0 }}>
        {(["generate", "library"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: tab === t ? "rgba(207,162,75,0.15)" : "transparent",
            border: `1px solid ${tab === t ? "rgba(207,162,75,0.30)" : "rgba(232,226,217,0.06)"}`,
            color: tab === t ? "#CFA24B" : "#5E584E",
          }}>
            {t === "generate" ? "Generate" : "Library"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
        {tab === "generate" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && generateSound()}
              placeholder="Describe the sound..."
              style={{
                padding: "10px 14px", borderRadius: 8, fontSize: 13, outline: "none",
                background: "#28261F", border: "1px solid rgba(232,226,217,0.08)", color: "#E8E2D9",
              }}
            />
            <button onClick={generateSound} disabled={isGenerating} style={{
              padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: isGenerating ? "#28261F" : "#7B9E84", color: isGenerating ? "#5E584E" : "#0D0C0A", border: "none",
            }}>
              {isGenerating ? "Generating..." : "Generate One-Shot"}
            </button>
            {error && <p style={{ color: "#C46B5A", fontSize: 12 }}>{error}</p>}
            {generatedUrl && (
              <button onClick={() => { onSelect(generatedUrl, prompt.trim()); onClose(); }} style={{
                padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: "rgba(207,162,75,0.15)", border: "1px solid rgba(207,162,75,0.30)", color: "#CFA24B",
              }}>
                Use This Sound
              </button>
            )}
          </div>
        )}
        {tab === "library" && (
          <p style={{ color: "#5E584E", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
            Connect to sample server to browse library
          </p>
        )}
      </div>
    </div>
  );
}
