"use client";
import { useEffect, useRef } from "react";
import { Track, RoomUser } from "@/lib/types";
import { STEM_COLORS, getUserColor } from "@/lib/constants";

interface Props {
  track: Track;
  userId: string | null;
  users: RoomUser[];
  onVoteDown: (trackId: string) => void;
  onVoteUp: (trackId: string) => void;
  onToggleMute?: (trackId: string) => void;
  isMuted?: boolean;
  totalUsers: number;
}

function drawWaveformData(canvas: HTMLCanvasElement, data: Float32Array, color: string) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.offsetWidth;
  const h = parent.offsetHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const mid = h / 2;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const numBars = Math.floor(w * 1.5);
  const samplesPerBar = Math.max(1, Math.floor(data.length / numBars));

  for (let i = 0; i < numBars; i++) {
    let peak = 0;
    const start = i * samplesPerBar;
    for (let j = 0; j < samplesPerBar; j++) {
      const abs = Math.abs(data[start + j] ?? 0);
      if (abs > peak) peak = abs;
    }
    const x = (i / numBars) * w;
    const lH = peak * (mid - 2);
    if (lH < 0.5) continue;
    const al = 0.35 + peak * 0.5;
    ctx.strokeStyle = `rgba(${r},${g},${b},${al})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, mid - lH); ctx.lineTo(x, mid - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, mid + 0.5); ctx.lineTo(x, mid + lH); ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
}

export default function TrackCard({ track, userId, users, onVoteDown, onVoteUp, onToggleMute, isMuted, totalUsers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasVotedDown = userId ? track.downVotes.includes(userId) : false;
  const hasVotedUp = userId ? track.upVotes.includes(userId) : false;

  const trackUser = users.find(u => u.id === track.userId);
  const trackUserIndex = users.findIndex(u => u.id === track.userId);
  const userColor = trackUserIndex >= 0 ? getUserColor(trackUserIndex) : null;
  const stemColor = STEM_COLORS[track.stemType] || "#A09888";

  useEffect(() => {
    if (!canvasRef.current || !track.audioUrl) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(track.audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();
        if (cancelled || !canvasRef.current) return;
        const data = decoded.getChannelData(0);
        drawWaveformData(canvasRef.current, data, stemColor);
      } catch {
        // audio fetch/decode failed — draw flat line
        if (!cancelled && canvasRef.current) {
          drawWaveformData(canvasRef.current, new Float32Array(0), stemColor);
        }
      }
    };

    load();
    const handleResize = () => {
      if (canvasRef.current) drawWaveformData(canvasRef.current, new Float32Array(0), stemColor);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
    };
  }, [track.audioUrl, stemColor]);

  const isOff = !track.active;
  const votes = isOff ? track.upVotes.length : track.downVotes.length;
  const needed = Math.floor(totalUsers / 2) + 1;

  return (
    <div style={{
      display: "flex", alignItems: "center", height: 56, borderRadius: 8, overflow: "hidden",
      background: isOff ? "#151412" : "#1E1C19",
      border: `1px solid ${isOff ? "rgba(232,226,217,0.03)" : "rgba(232,226,217,0.06)"}`,
      marginBottom: 4, opacity: isOff ? 0.55 : 1, transition: "all 0.25s",
    }}>
      {/* Status light + label */}
      <div
        onClick={() => onToggleMute?.(track.id)}
        style={{
          width: 90, padding: "0 14px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          height: "100%", borderRight: "1px solid rgba(232,226,217,0.06)", flexShrink: 0,
          color: isOff ? "#3A3832" : isMuted ? "#5E584E" : stemColor, textTransform: "capitalize",
          cursor: onToggleMute ? "pointer" : "default", transition: "all 0.25s",
        }}
      >
        {/* Status light */}
        <div style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0, transition: "all 0.25s",
          background: isOff ? "#2A2824" : isMuted ? "#5E584E" : stemColor,
          boxShadow: isOff || isMuted ? "none" : `0 0 6px ${stemColor}80`,
        }} />
        {track.stemType}
      </div>

      {/* Waveform */}
      <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden", background: "rgba(0,0,0,0.10)" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", filter: isOff ? "grayscale(1)" : "none", transition: "filter 0.25s" }} />
      </div>

      {/* Voting */}
      <div style={{
        width: 100, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5,
        height: "100%", borderLeft: "1px solid rgba(232,226,217,0.06)", flexShrink: 0,
      }}>
        {isOff ? (
          /* Track is off — show vote-up button */
          <button
            onClick={() => onVoteUp(track.id)}
            title={`Vote to restore (${votes}/${needed} needed)`}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6,
              fontSize: 10, fontFamily: "var(--fm)", fontWeight: 600, cursor: "pointer",
              background: hasVotedUp ? "rgba(123,158,132,0.20)" : "rgba(123,158,132,0.08)",
              border: `1px solid ${hasVotedUp ? "rgba(123,158,132,0.50)" : "rgba(123,158,132,0.20)"}`,
              color: "#7B9E84", transition: "all 0.15s",
            }}
          >
            ↑ {votes}/{needed}
          </button>
        ) : (
          /* Track is on — show vote-down button */
          <button
            onClick={() => onVoteDown(track.id)}
            title={`Vote to mute (${votes}/${needed} needed)`}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6,
              fontSize: 10, fontFamily: "var(--fm)", fontWeight: 600, cursor: "pointer",
              background: hasVotedDown ? "rgba(196,107,90,0.20)" : "rgba(232,226,217,0.04)",
              border: `1px solid ${hasVotedDown ? "rgba(196,107,90,0.50)" : "rgba(232,226,217,0.08)"}`,
              color: hasVotedDown ? "#C46B5A" : "#5E584E", transition: "all 0.15s",
            }}
          >
            ↓ {votes > 0 ? `${votes}/${needed}` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
