// chat-widget/SampleChat.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// --- Types ---

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
  duration_ms?: number;
  status: "running" | "done";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

let _msgId = 0;
function nextMsgId() {
  return `msg-${++_msgId}-${Date.now()}`;
}

interface SampleChatProps {
  apiUrl: string;
  title?: string;
  placeholder?: string;
  accentColor?: string;
}

// --- Lightweight Markdown ---

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) result.push(<br key={`br-${i}`} />);
    const parts = lines[i].split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (part.startsWith("**") && part.endsWith("**")) {
        result.push(<strong key={`${i}-${j}`}>{part.slice(2, -2)}</strong>);
      } else if (part.startsWith("*") && part.endsWith("*")) {
        result.push(<em key={`${i}-${j}`}>{part.slice(1, -1)}</em>);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        result.push(
          <code
            key={`${i}-${j}`}
            style={{
              background: "rgba(255,255,255,0.1)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: "0.9em",
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      } else {
        result.push(part);
      }
    }
  }
  return result;
}

// --- Shared Audio Manager ---
// Ensures only one sample plays at a time across chat + browser

interface AudioState {
  playingId: string | null;
  currentTime: number;
  duration: number;
}

function useSharedAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>({ playingId: null, currentTime: 0, duration: 0 });
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) {
      setState((s) => ({ ...s, currentTime: a.currentTime, duration: a.duration || 0 }));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const play = useCallback(
    (id: string, url: string) => {
      // If same sample, toggle pause/resume
      if (state.playingId === id && audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play();
          rafRef.current = requestAnimationFrame(tick);
        } else {
          audioRef.current.pause();
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
        return;
      }
      // Stop previous
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const audio = new Audio(url);
      audio.onended = () => {
        setState({ playingId: null, currentTime: 0, duration: 0 });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
      audio.onloadedmetadata = () => {
        setState((s) => ({ ...s, duration: audio.duration || 0 }));
      };
      audio.play();
      audioRef.current = audio;
      setState({ playingId: id, currentTime: 0, duration: 0 });
      rafRef.current = requestAnimationFrame(tick);
    },
    [state.playingId, tick]
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState({ playingId: null, currentTime: 0, duration: 0 });
  }, []);

  const seek = useCallback(
    (fraction: number) => {
      const a = audioRef.current;
      if (a && a.duration) {
        a.currentTime = fraction * a.duration;
        setState((s) => ({ ...s, currentTime: a.currentTime }));
      }
    },
    []
  );

  const isPlaying = useCallback(
    (id: string) => state.playingId === id && audioRef.current != null && !audioRef.current.paused,
    [state.playingId]
  );

  return { state, play, stop, seek, isPlaying, audioRef };
}

// --- Sample Parsing ---

interface ParsedSample {
  id: string;
  title: string;
  category: string;
  audioPath: string;
}

const SAMPLE_PATH_RE = /samples\/library\/([^/]+)\/(.+?\.wav)/g;

/** Encode each segment of a path for use in a URL (preserves `/`). */
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function parseMessageForSamples(text: string): { samples: ParsedSample[]; textWithoutPaths: string } {
  const samples: ParsedSample[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset lastIndex
  SAMPLE_PATH_RE.lastIndex = 0;
  while ((match = SAMPLE_PATH_RE.exec(text)) !== null) {
    const category = match[1];
    const filename = match[2];
    const audioPath = match[0];
    const id = `chat-${category}-${filename}`;
    if (!seen.has(id)) {
      seen.add(id);
      // Build title from filename: strip extension, replace " - " patterns
      const title = filename.replace(/\.wav$/i, "").replace(/\s*-\s*/g, " — ");
      samples.push({ id, title, category, audioPath });
    }
  }

  // Strip the raw path lines from text for cleaner display
  const textWithoutPaths = text.replace(/`audio:\s*samples\/library\/.+?\.wav`/g, "").replace(/^\s*samples\/library\/.+?\.wav\s*$/gm, "").replace(/\n{3,}/g, "\n\n");

  return { samples, textWithoutPaths };
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Fake Waveform ---

function FakeWaveform({ barCount, progress, accentColor }: { barCount: number; progress: number; accentColor: string }) {
  // Generate deterministic-looking random bar heights using a simple seed
  const bars = useMemo(() => {
    const b: number[] = [];
    let seed = 42;
    for (let i = 0; i < barCount; i++) {
      seed = (seed * 16807 + 7) % 2147483647;
      b.push(0.15 + 0.85 * ((seed % 100) / 100));
    }
    return b;
  }, [barCount]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1, height: 24, flex: 1 }}>
      {bars.map((h, i) => {
        const pct = i / barCount;
        const active = pct < progress;
        return (
          <div
            key={i}
            style={{
              width: 2,
              height: `${h * 100}%`,
              borderRadius: 1,
              background: active ? accentColor : "rgba(255,255,255,0.15)",
              transition: "background 0.1s",
            }}
          />
        );
      })}
    </div>
  );
}

// --- Inline Sample Card ---

function SampleCard({
  sample,
  apiUrl,
  accentColor,
  sharedAudio,
}: {
  sample: ParsedSample;
  apiUrl: string;
  accentColor: string;
  sharedAudio: ReturnType<typeof useSharedAudio>;
}) {
  const { state, play, seek, isPlaying: checkPlaying } = sharedAudio;
  const isActive = state.playingId === sample.id;
  const playing = checkPlaying(sample.id);
  const progress = isActive && state.duration > 0 ? state.currentTime / state.duration : 0;

  const url = `${apiUrl}/${encodePath(sample.audioPath)}`;

  const categoryColors: Record<string, string> = {
    kick: "#ef4444",
    "808": "#f97316",
    snare: "#eab308",
    hihat: "#22c55e",
    pad: "#3b82f6",
    fx: "#a855f7",
    vocal: "#ec4899",
    bass: "#f97316",
    clap: "#14b8a6",
    perc: "#6366f1",
  };

  const badgeColor = categoryColors[sample.category.toLowerCase()] || "#6b7280";

  return (
    <div
      style={{
        background: isActive ? "rgba(124, 58, 237, 0.08)" : "#1e1e38",
        border: `1px solid ${isActive ? "rgba(124, 58, 237, 0.3)" : "#2a2a4a"}`,
        borderRadius: 10,
        padding: "10px 12px",
        margin: "6px 0",
        transition: "all 0.2s ease",
      }}
    >
      {/* Top row: play button, title, category badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button
          onClick={() => play(sample.id, url)}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#fff",
            background: playing ? accentColor : "rgba(124, 58, 237, 0.5)",
            transition: "all 0.2s ease",
            flexShrink: 0,
            boxShadow: playing ? `0 0 12px ${accentColor}66` : "none",
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "\u275A\u275A" : "\u25B6"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#e8e8f0",
            }}
          >
            {sample.title}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            padding: "2px 7px",
            borderRadius: 4,
            background: `${badgeColor}22`,
            color: badgeColor,
            border: `1px solid ${badgeColor}44`,
            flexShrink: 0,
          }}
        >
          {sample.category}
        </span>
      </div>

      {/* Waveform + progress */}
      <div
        style={{ position: "relative", cursor: "pointer", marginBottom: 4 }}
        onClick={(e) => {
          if (!isActive) {
            play(sample.id, url);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seek(frac);
        }}
      >
        <FakeWaveform barCount={50} progress={progress} accentColor="#f59e0b" />
      </div>

      {/* Time display */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          opacity: 0.5,
          marginTop: 2,
        }}
      >
        <span>{isActive ? formatTime(state.currentTime) : "0:00"}</span>
        <span>{isActive && state.duration > 0 ? formatTime(state.duration) : "--:--"}</span>
      </div>
    </div>
  );
}

// --- SSE Parser ---

function parseSSE(
  text: string,
  onEvent: (type: string, data: Record<string, unknown>) => void
) {
  const blocks = text.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (dataStr) {
      try {
        onEvent(eventType, JSON.parse(dataStr));
      } catch {
        /* skip malformed */
      }
    }
  }
}

// --- Hook ---

function useSampleChat(apiUrl: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { id: nextMsgId(), role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantMsg: Message = { id: nextMsgId(), role: "assistant", content: "", toolCalls: [] };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;
      let buffer = "";
      let tokenBuffer = "";
      const toolMap = new Map<string, ToolCall>();

      try {
        const res = await fetch(`${apiUrl}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;
            parseSSE(part + "\n\n", (type, data) => {
              if (type === "token") {
                tokenBuffer += (data.content as string) || "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.content = tokenBuffer;
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (type === "tool_start") {
                const tool: ToolCall = {
                  name: (data.name as string) || "",
                  args: (data.args as Record<string, unknown>) || {},
                  id: (data.id as string) || "",
                  status: "running",
                };
                toolMap.set(tool.id, tool);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.toolCalls = Array.from(toolMap.values());
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (type === "tool_end") {
                const id = data.id as string;
                const existing = toolMap.get(id);
                if (existing) {
                  existing.status = "done";
                  existing.duration_ms = data.duration_ms as number;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = { ...updated[updated.length - 1] };
                    last.toolCalls = Array.from(toolMap.values());
                    updated[updated.length - 1] = last;
                    return updated;
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content = last.content || "Sorry, something went wrong. Please try again.";
            updated[updated.length - 1] = last;
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [apiUrl]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { messages, sendMessage, isStreaming, cancel };
}

// --- Styles ---

const STYLES = {
  bubble: {
    position: "fixed" as const,
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    zIndex: 9999,
    transition: "transform 0.2s",
  },
  panel: {
    position: "fixed" as const,
    bottom: 92,
    right: 24,
    width: 400,
    maxHeight: 560,
    borderRadius: 16,
    boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    zIndex: 9998,
    background: "#1a1a2e",
    color: "#e0e0e0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  header: {
    padding: "14px 18px",
    fontWeight: 600,
    fontSize: 15,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  userMsg: {
    alignSelf: "flex-end" as const,
    padding: "8px 14px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "80%",
    wordBreak: "break-word" as const,
  },
  assistantMsg: {
    alignSelf: "flex-start" as const,
    padding: "8px 14px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "88%",
    wordBreak: "break-word" as const,
  },
  toolCard: {
    margin: "4px 0",
    padding: "6px 10px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  toolName: {
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  toolArgs: {
    marginTop: 3,
    opacity: 0.6,
    fontSize: 11,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    color: "#fff",
  },
};

// --- Components ---

function ToolTraceCard({ tool }: { tool: ToolCall }) {
  const isRunning = tool.status === "running";
  return (
    <div style={STYLES.toolCard}>
      <div style={STYLES.toolName}>
        {isRunning ? (
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>&#9696;</span>
        ) : (
          <span style={{ color: "#4ade80" }}>&#10003;</span>
        )}
        {tool.name}
        {!isRunning && tool.duration_ms != null && (
          <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: "auto" }}>
            {tool.duration_ms}ms
          </span>
        )}
      </div>
      <div style={STYLES.toolArgs}>
        {Object.entries(tool.args)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ")}
      </div>
    </div>
  );
}

// --- Catalog Tree Types ---

interface CatalogSample {
  id: string;
  title: string;
  audioPath: string;
}

interface CatalogTree {
  categories: Record<string, CatalogSample[]>;
}

// --- File Browser Component ---

function FileBrowser({
  apiUrl,
  accentColor,
  sharedAudio,
}: {
  apiUrl: string;
  accentColor: string;
  sharedAudio: ReturnType<typeof useSharedAudio>;
}) {
  const [tree, setTree] = useState<CatalogTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasFetched = useRef(false);

  const { state, play, seek, isPlaying: checkPlaying } = sharedAudio;

  const togglePlay = (sample: CatalogSample) => {
    play(sample.id, `${apiUrl}/${encodePath(sample.audioPath)}`);
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetch(`${apiUrl}/catalog/tree`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CatalogTree) => {
        setTree(data);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [apiUrl]);

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
        Loading catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#f87171" }}>
        Failed to load catalog: {error}
      </div>
    );
  }

  if (!tree || Object.keys(tree.categories).length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
        No samples found.
      </div>
    );
  }

  const sortedCategories = Object.keys(tree.categories).sort();

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 10px",
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: 13,
      }}
    >
      {sortedCategories.map((cat) => {
        const samples = tree.categories[cat];
        const isExpanded = !!expanded[cat];
        return (
          <div key={cat}>
            <div
              onClick={() => toggleCategory(cat)}
              style={{
                padding: "5px 8px",
                cursor: "pointer",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                userSelect: "none",
                transition: "background 0.15s",
                background: isExpanded ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = isExpanded
                  ? "rgba(255,255,255,0.06)"
                  : "transparent";
              }}
            >
              <span style={{ fontSize: 11, width: 12, textAlign: "center" }}>
                {isExpanded ? "\u25BE" : "\u25B8"}
              </span>
              <span>{isExpanded ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}</span>
              <span style={{ fontWeight: 600 }}>{cat}</span>
              <span style={{ opacity: 0.5, marginLeft: "auto", fontSize: 11 }}>
                ({samples.length})
              </span>
            </div>
            {isExpanded && (
              <div style={{ paddingLeft: 28 }}>
                {samples.map((sample) => {
                  const isActive = state.playingId === sample.id;
                  const playing = checkPlaying(sample.id);
                  const progress = isActive && state.duration > 0 ? state.currentTime / state.duration : 0;

                  return (
                    <div
                      key={sample.id}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "default",
                        transition: "background 0.15s",
                        background: isActive ? "rgba(124, 58, 237, 0.1)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                      title={sample.id}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePlay(sample); }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 14,
                            lineHeight: 1,
                            color: isActive ? accentColor : "rgba(255,255,255,0.5)",
                            transition: "color 0.15s, text-shadow 0.2s",
                            flexShrink: 0,
                            textShadow: playing ? `0 0 8px ${accentColor}88` : "none",
                          }}
                          aria-label={playing ? `Pause ${sample.title}` : `Play ${sample.title}`}
                        >
                          {playing ? "\u275A\u275A" : "\u25B6"}
                        </button>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            color: isActive ? "#e8e8f0" : undefined,
                          }}
                        >
                          {sample.title}
                        </span>
                        {/* Animated equalizer bars when playing */}
                        {playing && (
                          <span style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 14, flexShrink: 0 }}>
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                style={{
                                  display: "inline-block",
                                  width: 2,
                                  background: accentColor,
                                  borderRadius: 1,
                                  animation: `eqBounce 0.${4 + i * 2}s ease-in-out infinite alternate`,
                                }}
                              />
                            ))}
                          </span>
                        )}
                        {isActive && state.duration > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'SF Mono', 'Fira Code', monospace",
                              opacity: 0.5,
                              flexShrink: 0,
                            }}
                          >
                            {formatTime(state.currentTime)}/{formatTime(state.duration)}
                          </span>
                        )}
                      </div>
                      {/* Compact progress bar */}
                      {isActive && (
                        <div
                          style={{
                            height: 2,
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: 1,
                            marginTop: 3,
                            cursor: "pointer",
                            overflow: "hidden",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            seek(frac);
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${progress * 100}%`,
                              background: `linear-gradient(90deg, ${accentColor}, #f59e0b)`,
                              borderRadius: 1,
                              transition: "width 0.1s linear",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Main Component ---

export default function SampleChat({
  apiUrl,
  title = "Sample Agent",
  placeholder = "Describe a sound...",
  accentColor = "#7c3aed",
}: SampleChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"chat" | "browser">("chat");
  const [input, setInput] = useState("");
  const { messages, sendMessage, isStreaming } = useSampleChat(apiUrl);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sharedAudio = useSharedAudio();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  return (
    <>
      {/* Spinner keyframes injected once */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes eqBounce { from { height: 3px; } to { height: 14px; } }
      `}</style>

      {/* Chat Panel */}
      {isOpen && (
        <div style={STYLES.panel}>
          <div
            style={{
              ...STYLES.header,
              background: accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{title}</span>
            <button
              onClick={() => setView(view === "chat" ? "browser" : "chat")}
              title={view === "chat" ? "Browse samples" : "Back to chat"}
              aria-label={view === "chat" ? "Browse samples" : "Back to chat"}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                borderRadius: 6,
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                color: "#fff",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.35)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)";
              }}
            >
              {view === "chat" ? "\uD83D\uDCC1" : "\uD83D\uDCAC"}
            </button>
          </div>

          {view === "chat" ? (
            <>
              <div style={STYLES.messages}>
                {messages.map((msg, msgIdx) => {
                  // Determine if this is the last message and still streaming
                  const isLastMsg = msgIdx === messages.length - 1;
                  const isThisMsgStreaming = isLastMsg && isStreaming && msg.role === "assistant";

                  return (
                    <div key={msg.id}>
                      {msg.role === "user" ? (
                        <div style={{ ...STYLES.userMsg, background: accentColor }}>
                          {msg.content}
                        </div>
                      ) : (
                        <div>
                          {msg.toolCalls?.map((tool, j) => (
                            <ToolTraceCard key={j} tool={tool} />
                          ))}
                          {msg.content && (() => {
                            // Only parse samples after streaming is done
                            const hasSamples = !isThisMsgStreaming && /samples\/library\/.+?\.wav/.test(msg.content);
                            if (hasSamples) {
                              const { samples, textWithoutPaths } = parseMessageForSamples(msg.content);
                              return (
                                <>
                                  <div style={STYLES.assistantMsg}>
                                    {renderMarkdown(textWithoutPaths)}
                                  </div>
                                  {samples.length > 0 && (
                                    <div style={{ marginTop: 4 }}>
                                      {samples.map((s) => (
                                        <SampleCard
                                          key={s.id}
                                          sample={s}
                                          apiUrl={apiUrl}
                                          accentColor={accentColor}
                                          sharedAudio={sharedAudio}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </>
                              );
                            }
                            return (
                              <div style={STYLES.assistantMsg}>{renderMarkdown(msg.content)}</div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div style={STYLES.inputRow}>
                <input
                  style={STYLES.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={placeholder}
                  disabled={isStreaming}
                />
                <button
                  style={{
                    ...STYLES.sendBtn,
                    background: accentColor,
                    opacity: isStreaming ? 0.5 : 1,
                  }}
                  onClick={handleSend}
                  disabled={isStreaming}
                >
                  {isStreaming ? "..." : "Send"}
                </button>
              </div>
            </>
          ) : (
            <FileBrowser apiUrl={apiUrl} accentColor={accentColor} sharedAudio={sharedAudio} />
          )}
        </div>
      )}

      {/* Floating Bubble */}
      <button
        style={{ ...STYLES.bubble, background: accentColor }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? "\u2715" : "\u266B"}
      </button>
    </>
  );
}
