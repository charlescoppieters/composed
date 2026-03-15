"use client";
import { useRef, useEffect } from "react";
import { RoomSettings, Track, StemType } from "@/lib/types";
import { STEM_COLORS } from "@/lib/constants";
import * as Tone from "tone";
import SamplerPads from "./SamplerPads";

interface Props {
  settings: RoomSettings;
  userId: string | null;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  loadedTrack: Track | null;
  onClearTrack: () => void;
  onPush: (track: Omit<Track, "downVotes" | "upVotes" | "active" | "pushedAt">) => void;
}

export default function CreationPanel({
  settings,
  userId,
  roomCode,
  localDestination,
  loadedTrack,
  onClearTrack,
  onPush,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw waveform for loaded track
  useEffect(() => {
    if (!loadedTrack || !canvasRef.current) return;
    let cancelled = false;

    const draw = async () => {
      try {
        const res = await fetch(loadedTrack.audioUrl);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        await ctx.close();
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const parent = canvas.parentElement!;
        const dpr = window.devicePixelRatio || 1;
        const w = parent.offsetWidth;
        const h = parent.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        const c = canvas.getContext("2d")!;
        c.scale(dpr, dpr);

        const data = decoded.getChannelData(0);
        const color = STEM_COLORS[loadedTrack.stemType] || "#CFA24B";
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const numBars = Math.floor(w * 1.5);
        const spp = Math.max(1, Math.floor(data.length / numBars));
        const mid = h / 2;

        for (let i = 0; i < numBars; i++) {
          let peak = 0;
          const start = i * spp;
          for (let j = 0; j < spp; j++) {
            const abs = Math.abs(data[start + j] ?? 0);
            if (abs > peak) peak = abs;
          }
          const x = (i / numBars) * w;
          const lH = peak * (mid - 2);
          if (lH < 0.5) continue;
          c.strokeStyle = `rgba(${r},${g},${b},${0.35 + peak * 0.5})`;
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, mid - lH); c.lineTo(x, mid - 0.5); c.stroke();
          c.beginPath(); c.moveTo(x, mid + 0.5); c.lineTo(x, mid + lH); c.stroke();
        }
        c.strokeStyle = `rgba(${r},${g},${b},0.12)`;
        c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(0, mid); c.lineTo(w, mid); c.stroke();
      } catch { /* silent */ }
    };

    draw();
    return () => { cancelled = true; };
  }, [loadedTrack]);

  const handlePush = (audioUrl: string, name: string, stemType: StemType) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "",
      name,
      audioUrl,
      stemType,
      creationLevel: 3,
      volume: 1,
      muted: false,
      removeVotes: [],
    });
  };

  const recommit = () => {
    if (!loadedTrack || !userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: loadedTrack.userName,
      name: loadedTrack.name,
      audioUrl: loadedTrack.audioUrl,
      stemType: loadedTrack.stemType,
      creationLevel: loadedTrack.creationLevel,
      volume: loadedTrack.volume,
      muted: false,
      removeVotes: [],
    });
    onClearTrack();
  };

  const stemColor = loadedTrack ? STEM_COLORS[loadedTrack.stemType] || "#CFA24B" : "#CFA24B";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Loaded track card */}
      {loadedTrack && (
        <div style={{
          borderRadius: 10, overflow: "hidden",
          border: `1px solid ${stemColor}30`,
          background: `${stemColor}08`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderBottom: `1px solid ${stemColor}18`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: stemColor, boxShadow: `0 0 8px ${stemColor}80`,
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#E8E2D9" }}>{loadedTrack.name}</span>
              <span style={{ fontSize: 11, color: "#5E584E", fontFamily: "var(--fm)", marginLeft: 8, textTransform: "capitalize" }}>{loadedTrack.stemType} · pulled from queue</span>
            </div>
            <button
              onClick={onClearTrack}
              style={{
                padding: "3px 10px", borderRadius: 5, fontSize: 11, fontFamily: "var(--fm)",
                fontWeight: 600, cursor: "pointer", background: "rgba(196,107,90,0.10)",
                border: "1px solid rgba(196,107,90,0.22)", color: "#C46B5A", transition: "all 0.15s",
              }}
            >
              Clear
            </button>
          </div>

          {/* Waveform */}
          <div style={{ height: 52, position: "relative", overflow: "hidden", background: "rgba(0,0,0,0.15)" }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>

          {/* Re-commit */}
          <div style={{ padding: "10px 14px" }}>
            <button
              onClick={recommit}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 7, fontSize: 13, fontWeight: 700,
                cursor: "pointer", border: "none", background: stemColor, color: "#0D0C0A",
                transition: "all 0.15s",
              }}
            >
              ↑ Commit to queue
            </button>
          </div>
        </div>
      )}

      {/* Creation tools */}
      <SamplerPads
        settings={settings}
        roomCode={roomCode}
        localDestination={localDestination}
        onPush={handlePush}
      />
    </div>
  );
}
