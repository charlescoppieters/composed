"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SETTINGS, MUSICAL_KEYS, SCALES, BAR_COUNTS } from "@/lib/constants";
import { MusicalKey, Scale } from "@/lib/types";

export default function RoomJoin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const [bpm, setBpm] = useState(DEFAULT_SETTINGS.bpm);
  const [key, setKey] = useState<MusicalKey>(DEFAULT_SETTINGS.key);
  const [scale, setScale] = useState<Scale>(DEFAULT_SETTINGS.scale);
  const [barCount, setBarCount] = useState<4 | 8 | 16>(DEFAULT_SETTINGS.barCount);

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) {
      setError("Enter your name and room code");
      return;
    }
    sessionStorage.setItem("composed-username", name);
    sessionStorage.setItem("composed-action", "join");
    router.push(`/room/${roomCode.toUpperCase()}`);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    sessionStorage.setItem("composed-username", name);
    sessionStorage.setItem("composed-action", "create");
    sessionStorage.setItem("composed-settings", JSON.stringify({ bpm, key, scale, barCount }));
    router.push(`/room/NEW`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-void)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fb)" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--fd)", fontSize: 48, fontWeight: 400, color: "var(--t1)", letterSpacing: -1 }}>Composed</h1>
          <p style={{ color: "var(--t3)", marginTop: 6, fontSize: 14 }}>Collaborative Jam Sessions</p>
        </div>

        {/* Name */}
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          style={{
            width: "100%", padding: "12px 16px", background: "var(--bg-raised)", border: "1px solid var(--glass-bd)",
            borderRadius: 10, color: "var(--t1)", fontSize: 14, fontFamily: "var(--fb)", outline: "none",
            boxSizing: "border-box",
          }}
        />

        {/* Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* BPM */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ color: "var(--t3)", fontSize: 14 }}>BPM</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="range" min={60} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={{ width: 112, accentColor: "var(--amber)" }} />
              <span style={{ width: 36, textAlign: "right", fontFamily: "var(--fm)", fontSize: 14, color: "var(--amber)" }}>{bpm}</span>
            </div>
          </div>

          {/* Key */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <label style={{ color: "var(--t3)", fontSize: 14 }}>Key</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={key} onChange={(e) => setKey(e.target.value as MusicalKey)}
                style={{ background: "var(--bg-raised)", border: "1px solid var(--glass-bd)", borderRadius: 10, padding: "6px 12px", color: "var(--t1)", fontSize: 14, fontFamily: "var(--fm)" }}>
                {MUSICAL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={scale} onChange={(e) => setScale(e.target.value as Scale)}
                style={{ background: "var(--bg-raised)", border: "1px solid var(--glass-bd)", borderRadius: 10, padding: "6px 12px", color: "var(--t1)", fontSize: 14, fontFamily: "var(--fm)" }}>
                {SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Loop length */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ color: "var(--t3)", fontSize: 14 }}>Loop</label>
            <div style={{ display: "flex", gap: 4 }}>
              {BAR_COUNTS.map((b) => (
                <button key={b} onClick={() => setBarCount(b)}
                  style={{
                    padding: "6px 12px", borderRadius: 10, fontFamily: "var(--fm)", fontSize: 14, cursor: "pointer", border: "1px solid",
                    background: barCount === b ? "var(--amber-soft)" : "var(--glass)",
                    borderColor: barCount === b ? "var(--amber-bd)" : "var(--glass-bd)",
                    color: barCount === b ? "var(--amber)" : "var(--t3)",
                  }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Create */}
        <button onClick={handleCreate}
          style={{ width: "100%", padding: 12, borderRadius: 10, fontWeight: 600, fontSize: 14, border: "none", cursor: "pointer", background: "var(--sage)", color: "var(--bg-void)" }}>
          Create Session
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, borderTop: "1px solid var(--glass-bd)" }} />
          <span style={{ color: "var(--t3)", fontSize: 10, fontFamily: "var(--fm)", letterSpacing: 2, textTransform: "uppercase" }}>or join</span>
          <div style={{ flex: 1, borderTop: "1px solid var(--glass-bd)" }} />
        </div>

        {/* Join */}
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" placeholder="Room code" value={roomCode}
            onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(""); }}
            maxLength={6}
            style={{
              flex: 1, padding: "10px 16px", background: "var(--bg-raised)", border: "1px solid var(--glass-bd)",
              borderRadius: 10, color: "var(--t1)", textAlign: "center", fontSize: 18, letterSpacing: "0.3em",
              textTransform: "uppercase", fontFamily: "var(--fm)", outline: "none",
            }}
          />
          <button onClick={handleJoin}
            style={{ padding: "10px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, border: "1px solid var(--glass-bd)", cursor: "pointer", background: "var(--glass)", color: "var(--t2)" }}>
            Join
          </button>
        </div>

        {error && <p style={{ textAlign: "center", fontSize: 11, color: "#C46B5A" }}>{error}</p>}
      </div>
    </div>
  );
}
