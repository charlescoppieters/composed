"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { ListenMode } from "@/lib/audio-engine";
import { DEFAULT_SETTINGS, STEM_COLORS, getUserColor } from "@/lib/constants";
import { Track, RoomUser, StemType, InstrumentMode } from "@/lib/types";
import { INSTRUMENT_CONFIGS } from "@/lib/instrument-config";
import TrackList from "./TrackList";
import InstrumentNav from "./InstrumentNav";
import ModeNav from "./ModeNav";
import InstrumentWorkspace from "./InstrumentWorkspace";
import SampleBrowser from "./SampleBrowser";
import AudienceMode, { FAKE_AUDIENCE_USERS } from "./AudienceMode";

const CHATBOT_API_URL = process.env.NEXT_PUBLIC_CHATBOT_URL || "http://localhost:8000";

const LISTEN_MODES: { value: ListenMode; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "master", label: "Master" },
  { value: "overlay", label: "Mix" },
];

/* ─── Avatar ─── */
function Avatar({ user, index, size = 22 }: { user: RoomUser; index: number; size?: number }) {
  const c = getUserColor(index);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size < 22 ? 7 : size < 30 ? 9 : 11, fontWeight: 600, flexShrink: 0,
      background: c.bg, color: c.text, border: `1.5px solid ${c.border}`,
    }}>
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ─── Resize Handle ─── */
function ResizeHandle({ side, onDrag }: { side: "left" | "right"; onDrag: (dx: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDrag(side === "left" ? dx : -dx);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onDrag, side]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 6, cursor: "col-resize", position: "relative", zIndex: 2, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{ width: 2, height: 32, borderRadius: 1, background: "rgba(232,226,217,0.08)", transition: "background 0.15s" }} />
    </div>
  );
}

/* ─── Main Component ─── */
export default function JamSession({ roomCode }: { roomCode: string }) {
  const { room, userId, trackQueue, createRoom, joinRoom, updateSettings, pushTrack, voteDown, voteUp, dequeueOwnTrack } = useRoom();
  const joinedRef = useRef(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (joinedRef.current || room) return;
    joinedRef.current = true;
    const userName = sessionStorage.getItem("composed-username") || "Anonymous";
    const action = sessionStorage.getItem("composed-action") || "join";
    if (roomCode === "NEW" && action === "create") {
      const settingsStr = sessionStorage.getItem("composed-settings");
      const settings = settingsStr ? JSON.parse(settingsStr) : DEFAULT_SETTINGS;
      createRoom(userName, settings);
    } else {
      joinRoom(roomCode, userName).then((ok) => {
        if (!ok) setJoinError("Room not found");
      });
    }
  }, [roomCode, room, joinRoom, createRoom]);

  useEffect(() => {
    if (room && roomCode === "NEW") window.history.replaceState(null, "", `/room/${room.code}`);
  }, [room, roomCode]);

  const { listenMode, setListenMode, isPlaying, play, pause, stop, setTrackVolume, previewLocal, clearLocal, getLocalDestination } = useAudioEngine(room, room?.tracks ?? []);
  const [localDest, setLocalDest] = useState<any>(null);
  const [activeInstrument, setActiveInstrument] = useState<StemType>(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("composed-instrument") as StemType) || "drums";
    }
    return "drums";
  });
  const [activeMode, setActiveMode] = useState<InstrumentMode>(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("composed-mode") as InstrumentMode) || "sequence";
    }
    return "sequence";
  });
  const [showSamples, setShowSamples] = useState(false);
  const [showAudience, setShowAudience] = useState(false);
  const [loadedTrack, setLoadedTrack] = useState<Track | null>(null);
  const [leftW, setLeftW] = useState(240);
  const [rightW, setRightW] = useState(220);
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set());

  // Persist instrument/mode to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("composed-instrument", activeInstrument);
  }, [activeInstrument]);
  useEffect(() => {
    sessionStorage.setItem("composed-mode", activeMode);
  }, [activeMode]);

  const toggleMute = useCallback((trackId: string) => {
    setMutedTracks(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
        setTrackVolume(trackId, 1);
      } else {
        next.add(trackId);
        setTrackVolume(trackId, 0);
      }
      return next;
    });
  }, [setTrackVolume]);

  useEffect(() => {
    if (room && !localDest) setLocalDest(getLocalDestination());
  }, [room, localDest, getLocalDestination]);

  // Sync inactive tracks to audio engine mute state
  useEffect(() => {
    if (!room) return;
    room.tracks.forEach((track) => {
      const shouldBeMuted = !track.active || mutedTracks.has(track.id);
      setTrackVolume(track.id, shouldBeMuted ? 0 : track.volume);
    });
  }, [room?.tracks, mutedTracks, setTrackVolume]);

  const handlePullFromQueue = useCallback(async (trackId: string) => {
    const track = await dequeueOwnTrack(trackId);
    if (!track) return;
    setLoadedTrack(track);
    previewLocal(track.audioUrl);
  }, [dequeueOwnTrack, previewLocal]);

  const handleClearTrack = useCallback(() => {
    setLoadedTrack(null);
    clearLocal();
  }, [clearLocal]);

  const onLeftDrag = useCallback((dx: number) => {
    setLeftW(w => Math.max(160, Math.min(400, w + dx)));
  }, []);
  const onRightDrag = useCallback((dx: number) => {
    setRightW(w => Math.max(160, Math.min(400, w + dx)));
  }, []);

  /* ─── Loading / Error ─── */
  if (!room) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0C0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          {joinError ? (
            <>
              <p style={{ color: "#C46B5A", fontSize: 14, marginBottom: 16 }}>{joinError}</p>
              <a href="/" style={{ color: "#CFA24B", fontSize: 12, fontFamily: "var(--fm)", textDecoration: "underline" }}>Back to home</a>
            </>
          ) : (
            <>
              <div style={{ width: 24, height: 24, border: "2px solid #CFA24B", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" }} />
              <p style={{ color: "#5E584E", fontSize: 12, fontFamily: "var(--fm)", marginTop: 12 }}>Connecting to {roomCode}...</p>
            </>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentUser = room.users.find(u => u.id === userId);
  const currentUserIndex = room.users.findIndex(u => u.id === userId);
  const instrumentConfig = INSTRUMENT_CONFIGS[activeInstrument];

  return (
    <div style={{ height: "100vh", background: "#0D0C0A", display: "flex", alignItems: "stretch", justifyContent: "center" }}>
      {/* Floating shell */}
      <div style={{
        flex: 1, margin: 12, background: "#141311", border: "1px solid rgba(232,226,217,0.06)", borderRadius: 14,
        display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0,
      }}>

        {/* ═══ TOP BAR ═══ */}
        <header style={{
          height: 56, padding: "0 20px", borderBottom: "1px solid rgba(232,226,217,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--fd)", fontSize: 20, fontStyle: "italic", color: "#E8E2D9", letterSpacing: -0.5 }}>Composed</span>
            <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "#5E584E", letterSpacing: 1.5, textTransform: "uppercase" }}>{room.code}</span>
            {/* Avatar stack */}
            <div style={{ display: "flex" }}>
              {room.users.slice(0, 5).map((u, i) => (
                <div key={u.id} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: room.users.length - i }}>
                  <Avatar user={u} index={i} size={22} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: "var(--fm)" }}>
              <span style={{ fontSize: 13, color: "#CFA24B" }}>{room.settings.key}{room.settings.scale === "minor" ? "m" : ""}</span>
              <span style={{ fontSize: 13, color: "#5E584E", margin: "0 4px" }}>·</span>
              <span style={{ fontSize: 15, color: "#CFA24B", fontWeight: 600 }}>{room.settings.bpm}</span>
            </span>
            <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "#5E584E" }}>{room.settings.barCount} bars</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => isPlaying ? pause() : play()} style={{
                width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid",
                background: isPlaying ? "rgba(207,162,75,0.15)" : "rgba(123,158,132,0.12)",
                borderColor: isPlaying ? "rgba(207,162,75,0.30)" : "rgba(123,158,132,0.20)",
                fontSize: 14, color: isPlaying ? "#CFA24B" : "#7B9E84", transition: "all 0.15s",
              }}>{isPlaying ? "⏸" : "▶"}</button>
              <button onClick={stop} style={{
                width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                background: "rgba(232,226,217,0.03)", border: "1px solid rgba(232,226,217,0.06)",
                fontSize: 12, color: "#5E584E", transition: "all 0.15s",
              }}>⏹</button>
            </div>
          </div>
        </header>

        {/* ═══ 3-COLUMN BODY ═══ */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

          {/* ─── LEFT: QUEUE ─── */}
          <aside style={{ width: leftW, padding: "20px 16px", borderRight: "1px solid rgba(232,226,217,0.06)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
            <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16, fontWeight: 500 }}>Queue</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {trackQueue.length === 0 && room.tracks.length === 0 && (
                <p style={{ color: "#A09888", fontSize: 13, lineHeight: 1.6 }}>Create a groove below and commit it to start the session.</p>
              )}
              {trackQueue.map((track) => {
                const tu = room.users.find(u => u.id === track.userId);
                const ti = room.users.findIndex(u => u.id === track.userId);
                const isOwn = track.userId === userId;
                return (
                  <div key={track.id} style={{
                    padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
                    background: isOwn ? "rgba(207,162,75,0.12)" : "rgba(232,226,217,0.03)",
                    border: `1px solid ${isOwn ? "rgba(207,162,75,0.25)" : "rgba(232,226,217,0.06)"}`,
                    transition: "all 0.2s",
                  }}>
                    {tu && <Avatar user={tu} index={ti} size={28} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#E8E2D9", lineHeight: 1.3 }}>{track.name}</div>
                      <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", lineHeight: 1.3, marginTop: 2 }}>{track.stemType} · queued</div>
                    </div>
                    {isOwn && (
                      <button
                        onClick={() => handlePullFromQueue(track.id)}
                        title="Pull back from queue"
                        style={{
                          flexShrink: 0, padding: "4px 8px", borderRadius: 6, fontSize: 10,
                          fontFamily: "var(--fm)", fontWeight: 600, cursor: "pointer",
                          background: "rgba(207,162,75,0.10)", border: "1px solid rgba(207,162,75,0.25)",
                          color: "#CFA24B", transition: "all 0.15s",
                        }}
                      >
                        ↩ Pull
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI Coach */}
            <div style={{ marginTop: "auto", borderTop: "1px solid rgba(232,226,217,0.06)", paddingTop: 16 }}>
              <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, fontWeight: 500 }}>AI Coach</div>
              <p style={{ fontSize: 13, color: "#A09888", lineHeight: 1.6 }}>
                {room.tracks.length === 0
                  ? "Start by creating a drum pattern and committing it."
                  : `${room.tracks.length} stem${room.tracks.length > 1 ? "s" : ""} in the master. Try adding ${room.tracks.some(t => t.stemType === "bass") ? "melody" : "bass"}.`}
              </p>
            </div>

            {/* Sidebar buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button onClick={() => setShowSamples(!showSamples)} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: showSamples ? "rgba(207,162,75,0.15)" : "rgba(232,226,217,0.03)",
                border: `1px solid ${showSamples ? "rgba(207,162,75,0.30)" : "rgba(232,226,217,0.06)"}`,
                color: showSamples ? "#CFA24B" : "#5E584E", transition: "all 0.15s",
              }}>
                Samples
              </button>
              <button onClick={() => setShowAudience(!showAudience)} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: showAudience ? "rgba(123,158,132,0.15)" : "rgba(232,226,217,0.03)",
                border: `1px solid ${showAudience ? "rgba(123,158,132,0.30)" : "rgba(232,226,217,0.06)"}`,
                color: showAudience ? "#7B9E84" : "#5E584E", transition: "all 0.15s",
              }}>
                Audience
              </button>
            </div>
          </aside>

          <ResizeHandle side="left" onDrag={onLeftDrag} />

          {/* ─── CENTER ─── */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

            {/* Deck */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(232,226,217,0.06)", background: "rgba(0,0,0,0.10)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {currentUser && <Avatar user={currentUser} index={currentUserIndex} size={32} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "#E8E2D9", letterSpacing: -0.3 }}>Your Workspace</div>
                    <div style={{ fontFamily: "var(--fm)", fontSize: 12, color: instrumentConfig.color, marginTop: 3 }}>
                      {currentUser?.name} · <span style={{ color: instrumentConfig.color }}>{instrumentConfig.label}</span> · {activeMode === "generate" ? "generating" : activeMode === "sequence" ? "sequencing" : "performing"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Listen mode */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {LISTEN_MODES.map((mode) => {
                      const active = listenMode === mode.value;
                      return (
                        <button key={mode.value} onClick={() => setListenMode(mode.value)} style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: active ? "rgba(207,162,75,0.15)" : "rgba(232,226,217,0.03)",
                          border: `1px solid ${active ? "rgba(207,162,75,0.30)" : "rgba(232,226,217,0.06)"}`,
                          color: active ? "#CFA24B" : "#5E584E", transition: "all 0.15s",
                        }}>
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontFamily: "var(--fm)" }}>
                    <span style={{ fontSize: 24, color: "#CFA24B", letterSpacing: -1, fontWeight: 500 }}>{room.settings.bpm.toFixed(2)}</span>
                    <span style={{ fontSize: 10, color: "#5E584E", marginLeft: 4 }}>BPM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Master stems */}
            <div style={{ padding: "16px 24px 0", borderBottom: "1px solid rgba(232,226,217,0.06)", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>
                Master — {room.tracks.length} merged stem{room.tracks.length !== 1 ? "s" : ""}
              </div>
              <div style={{ maxHeight: 188, overflowY: "auto", paddingBottom: 16 }}>
                <TrackList tracks={room.tracks} userId={userId} users={room.users} onVoteDown={voteDown} onVoteUp={voteUp} onToggleMute={toggleMute} mutedTracks={mutedTracks} totalUsers={room.users.length} />
              </div>
            </div>

            {/* ═══ INSTRUMENT BAR ═══ */}
            <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(232,226,217,0.06)" }}>
              <InstrumentNav active={activeInstrument} onChange={setActiveInstrument} />
            </div>

            {/* ═══ MODE BAR ═══ */}
            <ModeNav active={activeMode} onChange={setActiveMode} />

            {/* ═══ TOOL AREA ═══ */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", minHeight: 200 }}>
              {showAudience ? (
                <AudienceMode
                  users={room.users}
                  tracks={room.tracks}
                  bpm={room.settings.bpm}
                  useFakeUsers={room.users.length < 2}
                />
              ) : localDest && (
                <InstrumentWorkspace
                  settings={room.settings}
                  stemType={activeInstrument}
                  mode={activeMode}
                  userId={userId}
                  roomCode={room.code}
                  localDestination={localDest}
                  onPush={pushTrack}
                  previewLocal={previewLocal}
                  clearLocal={clearLocal}
                />
              )}
            </div>
          </main>

          <ResizeHandle side="right" onDrag={onRightDrag} />

          {/* ─── RIGHT: SESSION ─── */}
          <aside style={{ width: rightW, padding: "20px 16px", borderLeft: "1px solid rgba(232,226,217,0.06)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
            <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontWeight: 500 }}>Session</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {room.users.map((user, i) => {
                const isMe = user.id === userId;
                const userTracks = room.tracks.filter(t => t.userId === user.id);
                const activeStem = isMe ? activeInstrument : (userTracks.length > 0 ? userTracks[userTracks.length - 1].stemType : null);
                return (
                  <div key={user.id} style={{
                    padding: "12px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
                    background: "rgba(232,226,217,0.03)", border: "1px solid rgba(232,226,217,0.06)", transition: "all 0.2s",
                  }}>
                    <Avatar user={user} index={i} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E2D9", lineHeight: 1.3 }}>
                        {user.name}{isMe && <span style={{ fontWeight: 400, fontSize: 11, color: "#5E584E", marginLeft: 4 }}>(you)</span>}
                      </div>
                      <div style={{ fontFamily: "var(--fm)", fontSize: 11, lineHeight: 1.3, marginTop: 2, color: activeStem ? STEM_COLORS[activeStem] : "#5E584E" }}>
                        {activeStem ? `on ${activeStem}` : "listening"}
                      </div>
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: activeStem ? STEM_COLORS[activeStem] : "#5E584E",
                      boxShadow: activeStem ? `0 0 8px ${STEM_COLORS[activeStem]}50` : "none",
                    }} />
                  </div>
                );
              })}
            </div>

            {/* Activity */}
            <div style={{ marginTop: "auto", borderTop: "1px solid rgba(232,226,217,0.06)", paddingTop: 16 }}>
              <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>Activity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {room.tracks.slice(-3).reverse().map((track) => {
                  const tu = room.users.find(u => u.id === track.userId);
                  const ti = room.users.findIndex(u => u.id === track.userId);
                  return (
                    <div key={track.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#5E584E" }}>
                      {tu && <Avatar user={tu} index={ti} size={20} />}
                      <span><b style={{ color: "#A09888", fontWeight: 600 }}>{tu?.name || "Someone"}</b> committed {track.name}</span>
                    </div>
                  );
                })}
                {room.tracks.length === 0 && <p style={{ fontSize: 12, color: "#5E584E" }}>No activity yet</p>}
              </div>
            </div>
          </aside>
        </div>

        {/* Sample browser overlay */}
        {showSamples && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", zIndex: 50,
            background: "#1A1917", borderTop: "1px solid rgba(232,226,217,0.08)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid rgba(232,226,217,0.06)" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#E8E2D9" }}>Sample Browser</span>
              <button onClick={() => setShowSamples(false)} style={{ background: "none", border: "none", color: "#5E584E", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
              <SampleBrowser apiUrl={CHATBOT_API_URL} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
