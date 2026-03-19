"use client";
import { useState } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";
import { INSTRUMENT_CONFIGS } from "@/lib/instrument-config";
import { timeStretchToLoop, bufferToWav } from "@/lib/audio-utils";
import WaveformPreview from "@/components/WaveformPreview";
import CommitBar from "@/components/CommitBar";

interface Props {
  settings: RoomSettings;
  stemType: StemType;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (audioUrl: string, name: string, stemType: StemType, creationLevel: 1 | 2 | 3 | 4) => void;
  previewLocal: (audioUrl: string) => Promise<void>;
  clearLocal: () => void;
}

type Stage = "idle" | "generating" | "stretching" | "ready";

export default function GenerateMode({ settings, stemType, roomCode, localDestination, onPush, previewLocal, clearLocal }: Props) {
  const config = INSTRUMENT_CONFIGS[stemType];
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [isCommitting, setIsCommitting] = useState(false);
  const [committableUrl, setCommittableUrl] = useState<string | null>(null);
  const [stretchInfo, setStretchInfo] = useState<{ ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);

  const targetDuration = (settings.barCount * 4 * 60) / settings.bpm;

  const fullPrompt = () => {
    const base = prompt.trim() || config.generate.presets[0];
    return `${config.generate.promptPrefix}, ${base}, ${settings.bpm} BPM, key of ${settings.key} ${settings.scale}, ${settings.barCount} bar loop`;
  };

  const generate = async () => {
    setStage("generating");
    setError(null);
    setCommittableUrl(null);
    setStretchInfo(null);
    clearLocal();

    try {
      // 1. Generate via ElevenLabs
      const res = await fetch("/api/elevenlabs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt(),
          duration_seconds: Math.min(targetDuration, 22),
          stemType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorType(data.errorType || null);
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      const { audioUrl: rawUrl } = await res.json();

      // 2. Time-stretch to exact loop duration
      setStage("stretching");
      const { buffer: stretchedBuffer, stretchRatio } = await timeStretchToLoop(rawUrl, targetDuration);
      setStretchInfo({ ratio: stretchRatio });

      // 3. Export stretched audio as WAV, upload to R2
      const wav = bufferToWav(stretchedBuffer);
      const fd = new FormData();
      fd.append("file", wav, `${stemType}-loop.wav`);
      fd.append("roomCode", roomCode);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url: finalUrl } = await uploadRes.json();
      setCommittableUrl(finalUrl);

      // 4. Preview the BPM-matched loop synced to transport
      await previewLocal(finalUrl);

      setStage("ready");
    } catch (err: any) {
      setError(err.message || "Generation failed");
      setStage("idle");
    }
  };

  const commit = async () => {
    if (!committableUrl) return;
    setIsCommitting(true);
    try {
      clearLocal();
      onPush(committableUrl, `AI ${config.label} Loop`, stemType, 1);
      setCommittableUrl(null);
      setPrompt("");
      setStretchInfo(null);
      setStage("idle");
    } finally {
      setIsCommitting(false);
    }
  };

  const clear = () => {
    clearLocal();
    setCommittableUrl(null);
    setPrompt("");
    setError(null);
    setStretchInfo(null);
    setStage("idle");
  };

  const isBusy = stage === "generating" || stage === "stretching";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

      {/* Loop info banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8,
        background: "rgba(207,162,75,0.08)", border: "1px solid rgba(207,162,75,0.15)",
      }}>
        <span style={{ fontSize: 12, color: "#CFA24B", fontFamily: "var(--fm)" }}>
          Generating {settings.barCount}-bar loop · {settings.bpm} BPM · {settings.key}{settings.scale === "minor" ? "m" : ""} · {targetDuration.toFixed(1)}s
        </span>
      </div>

      {/* Prompt input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !isBusy && generate()}
            placeholder={`Describe a ${config.label.toLowerCase()} loop...`}
            disabled={isBusy}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10, fontSize: 14, outline: "none",
              background: "#1E1C19", border: "1px solid rgba(232,226,217,0.08)", color: "#E8E2D9",
              fontFamily: "var(--fb)",
            }}
          />
          <button
            onClick={generate}
            disabled={isBusy}
            style={{
              padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: isBusy ? "default" : "pointer", border: "none",
              background: isBusy ? "#28261F" : config.color,
              color: isBusy ? "#5E584E" : "#0D0C0A",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}
          >
            {stage === "generating" ? "Generating..." : stage === "stretching" ? "Fitting to BPM..." : "Generate Loop"}
          </button>
        </div>

        {/* Presets */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {config.generate.presets.map(preset => (
            <button
              key={preset}
              onClick={() => setPrompt(preset)}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                background: prompt === preset ? `${config.color}20` : "rgba(232,226,217,0.03)",
                border: `1px solid ${prompt === preset ? `${config.color}40` : "rgba(232,226,217,0.06)"}`,
                color: prompt === preset ? config.color : "#A09888",
                transition: "all 0.15s",
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Error / Fallback */}
      {error && (
        <div style={{
          padding: "16px 20px", borderRadius: 12, fontSize: 13,
          background: errorType === "credits" || errorType === "rate_limit"
            ? "rgba(207,162,75,0.06)" : "rgba(196,107,90,0.06)",
          border: `1px solid ${errorType === "credits" || errorType === "rate_limit"
            ? "rgba(207,162,75,0.2)" : "rgba(196,107,90,0.2)"}`,
          display: "flex", flexDirection: "column", gap: 10,
          animation: "fadeIn 0.2s ease-out",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>
              {errorType === "credits" ? "⚡" : errorType === "rate_limit" ? "⏳" : "✦"}
            </span>
            <span style={{
              fontWeight: 600,
              color: errorType === "credits" || errorType === "rate_limit" ? "#CFA24B" : "#C46B5A",
            }}>
              {errorType === "credits"
                ? "AI generation credits used up"
                : errorType === "rate_limit"
                ? "Too many requests — cooling down"
                : "Generation unavailable right now"}
            </span>
          </div>
          <p style={{ color: "#A09888", fontSize: 12, lineHeight: 1.5, margin: 0 }}>
            {errorType === "credits"
              ? "The AI sound engine has reached its usage limit. You can still create music using the preset samples and the sampler pads — no generation needed."
              : errorType === "rate_limit"
              ? "The AI engine is rate-limited. Wait a moment and try again, or use preset samples in the meantime."
              : "Something went wrong connecting to the AI engine. Try again in a moment — preset samples are always available."}
          </p>
          <button
            onClick={() => { setError(null); setErrorType(null); }}
            style={{
              alignSelf: "flex-start", padding: "6px 14px", borderRadius: 8, fontSize: 11,
              fontWeight: 600, cursor: "pointer", border: "1px solid rgba(232,226,217,0.08)",
              background: "rgba(232,226,217,0.04)", color: "#A09888", transition: "all 0.15s",
            }}
          >
            Dismiss
          </button>
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Stretching status */}
      {stage === "stretching" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 24, height: 24, border: "2px solid #CFA24B", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#CFA24B", fontSize: 13, marginTop: 12 }}>
            Time-stretching to {settings.bpm} BPM...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Generated preview */}
      {stage === "ready" && committableUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 1, textTransform: "uppercase" }}>
              Loop Preview
            </div>
            {stretchInfo && (
              <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "#5E584E" }}>
                {stretchInfo.ratio > 1.01 ? `sped up ${((stretchInfo.ratio - 1) * 100).toFixed(0)}%` :
                 stretchInfo.ratio < 0.99 ? `slowed ${((1 - stretchInfo.ratio) * 100).toFixed(0)}%` :
                 "perfect fit"}
                {" "}to match {settings.bpm} BPM
              </span>
            )}
          </div>
          <WaveformPreview audioUrl={committableUrl} color={config.color} height={80} />
          <p style={{ fontFamily: "var(--fm)", fontSize: 10, color: "#7B9E84", textAlign: "center" }}>
            Playing in sync with master · {settings.barCount}-bar loop · BPM-matched
          </p>
        </div>
      )}

      {/* Empty state */}
      {stage === "idle" && !error && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: "#5E584E", fontSize: 14, marginBottom: 8 }}>
            Describe a {config.label.toLowerCase()} loop or pick a preset
          </p>
          <p style={{ color: "#5E584E", fontSize: 11, fontFamily: "var(--fm)" }}>
            AI-generated loops are time-stretched to your BPM and play in sync with the master
          </p>
        </div>
      )}

      <CommitBar
        settings={settings}
        hasContent={stage === "ready" && !!committableUrl}
        isCommitting={isCommitting}
        onClear={clear}
        onCommit={commit}
      />
    </div>
  );
}
