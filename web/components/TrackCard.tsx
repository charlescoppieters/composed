"use client";
import { useEffect, useRef } from "react";
import { Track, RoomUser } from "@/lib/types";
import { STEM_COLORS, getUserColor } from "@/lib/constants";

interface Props {
  track: Track;
  userId: string | null;
  users: RoomUser[];
  onVoteRemove: (trackId: string) => void;
  onUnvoteRemove: (trackId: string) => void;
  onToggleMute?: (trackId: string) => void;
  isMuted?: boolean;
  totalUsers: number;
}

function drawWaveform(canvas: HTMLCanvasElement, color: string, stemType: string) {
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
  const n = Math.floor(w * 1.5);

  for (let i = 0; i < n; i++) {
    const t = i / n;
    let a = 0;
    if (stemType === "drums") {
      const bp = (t * 16) % 1, bn = Math.floor(t * 16);
      let v = 0;
      if (bn % 4 === 0 && bp < 0.15) v = (1 - bp / 0.15) * 0.95;
      else if (bn % 4 === 2 && bp < 0.12) v = (1 - bp / 0.12) * 0.7;
      if (bp < 0.04) v = Math.max(v, (1 - bp / 0.04) * 0.25);
      a = Math.max(0, v + Math.random() * 0.08);
    } else if (stemType === "bass") {
      const wv = Math.sin(t * Math.PI * 6) * 0.4 + 0.55;
      const sb = Math.sin(t * Math.PI * 24) * 0.15;
      a = Math.max(0, Math.min(1, wv + sb + (Math.random() - 0.5) * 0.15));
    } else if (stemType === "chords") {
      const cp = (t * 4) % 1;
      const env = cp < 0.05 ? cp / 0.05 : cp > 0.85 ? (1 - cp) / 0.15 : 1;
      a = Math.max(0, Math.min(1, (0.4 + Math.sin(t * Math.PI * 20) * 0.1 + (Math.random() - 0.5) * 0.1) * env));
    } else {
      const ph2 = Math.sin(t * Math.PI * 8) * 0.3 + 0.5;
      const ns = (Math.random() - 0.5) * 0.4;
      const gt = Math.sin(t * Math.PI * 4) > -0.2 ? 1 : 0.05;
      a = Math.max(0, Math.min(1, ph2 + ns)) * gt;
    }
    const x = (i / n) * w, lH = a * (mid - 2);
    if (lH < 0.5) continue;
    const al = 0.35 + a * 0.5;
    ctx.strokeStyle = `rgba(${r},${g},${b},${al})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, mid - lH); ctx.lineTo(x, mid - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, mid + 0.5); ctx.lineTo(x, mid + lH); ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
}

export default function TrackCard({ track, userId, users, onVoteRemove, onUnvoteRemove, onToggleMute, isMuted, totalUsers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasVoted = userId ? track.removeVotes.includes(userId) : false;
  const keepVotes = totalUsers - track.removeVotes.length;
  const removeVotes = track.removeVotes.length;

  const trackUser = users.find(u => u.id === track.userId);
  const trackUserIndex = users.findIndex(u => u.id === track.userId);
  const userColor = trackUserIndex >= 0 ? getUserColor(trackUserIndex) : null;
  const stemColor = STEM_COLORS[track.stemType] || "#A09888";

  useEffect(() => {
    if (!canvasRef.current) return;
    drawWaveform(canvasRef.current, stemColor, track.stemType);
    const handleResize = () => { if (canvasRef.current) drawWaveform(canvasRef.current, stemColor, track.stemType); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [stemColor, track.stemType]);

  return (
    <div style={{
      display: "flex", alignItems: "center", height: 56, borderRadius: 8, overflow: "hidden",
      background: "#1E1C19", border: "1px solid rgba(232,226,217,0.06)", marginBottom: 4,
    }}>
      {/* Label + mute */}
      <div
        onClick={() => onToggleMute?.(track.id)}
        style={{
          width: 90, padding: "0 14px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          height: "100%", borderRight: "1px solid rgba(232,226,217,0.06)", flexShrink: 0,
          color: isMuted ? "#5E584E" : stemColor, textTransform: "capitalize",
          cursor: onToggleMute ? "pointer" : "default", opacity: isMuted ? 0.5 : 1,
          transition: "all 0.15s",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: isMuted ? "#5E584E" : stemColor, flexShrink: 0 }} />
        {track.stemType}
      </div>

      {/* Waveform */}
      <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden", background: "rgba(0,0,0,0.10)" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {/* Meta */}
      <div style={{
        width: 100, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
        height: "100%", borderLeft: "1px solid rgba(232,226,217,0.06)", flexShrink: 0,
      }}>
        {userColor && (
          <div style={{
            width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 600, flexShrink: 0, background: userColor.bg, color: userColor.text,
          }}>
            {trackUser?.name.charAt(0).toUpperCase()}
          </div>
        )}
        <button onClick={() => hasVoted ? onUnvoteRemove(track.id) : onVoteRemove(track.id)}
          style={{
            width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontFamily: "var(--fm)", fontWeight: 500, cursor: "pointer",
            background: "rgba(123,158,132,0.12)", border: "1px solid rgba(123,158,132,0.25)", color: "#7B9E84",
            transition: "all 0.15s",
          }}>
          ✓{keepVotes}
        </button>
        {removeVotes > 0 && (
          <button onClick={() => hasVoted ? onUnvoteRemove(track.id) : onVoteRemove(track.id)}
            style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontFamily: "var(--fm)", fontWeight: 500, cursor: "pointer",
              background: "rgba(196,107,90,0.12)", border: "1px solid rgba(196,107,90,0.25)", color: "#C46B5A",
              transition: "all 0.15s",
            }}>
            ✕{removeVotes}
          </button>
        )}
      </div>
    </div>
  );
}
