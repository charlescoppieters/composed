"use client";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// --- Types ---
interface ToolCall { name: string; args: Record<string, unknown>; id: string; duration_ms?: number; status: "running" | "done"; }
interface Message { id: string; role: "user" | "assistant"; content: string; toolCalls?: ToolCall[]; }
interface CatalogTree { total_samples: number; categories: Record<string, CatalogSample[]>; }
interface CatalogSample { id: string; title: string; category: string; path: string; }
interface ParsedSample { id: string; title: string; category: string; audioPath: string; }
interface Props { apiUrl: string; }

let _id = 0;
const mid = () => `sb-${++_id}-${Date.now()}`;

// --- Audio ---
function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const raf = useRef<number>(0);

  const tick = useCallback(() => {
    if (ref.current && !ref.current.paused) {
      setCur(ref.current.currentTime);
      setDur(ref.current.duration || 0);
      raf.current = requestAnimationFrame(tick);
    }
  }, []);

  const play = useCallback((id: string, url: string) => {
    if (playingId === id && ref.current) {
      if (ref.current.paused) { ref.current.play(); raf.current = requestAnimationFrame(tick); }
      else { ref.current.pause(); cancelAnimationFrame(raf.current); }
      return;
    }
    if (ref.current) { ref.current.pause(); ref.current = null; }
    cancelAnimationFrame(raf.current);
    const a = new Audio(url);
    a.onended = () => { setPlayingId(null); setCur(0); setDur(0); };
    a.onloadedmetadata = () => setDur(a.duration || 0);
    a.play();
    ref.current = a;
    setPlayingId(id);
    setCur(0); setDur(0);
    raf.current = requestAnimationFrame(tick);
  }, [playingId, tick]);

  const seek = useCallback((f: number) => {
    if (ref.current?.duration) { ref.current.currentTime = f * ref.current.duration; setCur(ref.current.currentTime); }
  }, []);

  const isPlaying = useCallback((id: string) => playingId === id && ref.current != null && !ref.current.paused, [playingId]);

  return { playingId, cur, dur, play, seek, isPlaying };
}

// --- SSE Chat ---
function useChat(apiUrl: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);

  const send = useCallback(async (text: string) => {
    const userMsg: Message = { id: mid(), role: "user", content: text };
    const assistantMsg: Message = { id: mid(), role: "assistant", content: "", toolCalls: [] };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch(`${apiUrl}/chat/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            setMessages(prev => {
              const msgs = [...prev];
              const last = { ...msgs[msgs.length - 1] };
              if (evt.type === "token") last.content += evt.content;
              else if (evt.type === "tool_start") last.toolCalls = [...(last.toolCalls || []), { name: evt.name, args: evt.args || {}, id: evt.call_id || mid(), status: "running" }];
              else if (evt.type === "tool_end") last.toolCalls = (last.toolCalls || []).map(t => t.name === evt.name && t.status === "running" ? { ...t, status: "done" as const, duration_ms: evt.duration_ms } : t);
              msgs[msgs.length - 1] = last;
              return msgs;
            });
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + "\n\n*Connection error*" };
        return msgs;
      });
    }
    setStreaming(false);
  }, [apiUrl]);

  return { messages, send, streaming };
}

// --- Helpers ---
const SAMPLE_RE = /samples\/library\/([^/]+)\/(.+?\.wav)/g;
function parseSamples(text: string): ParsedSample[] {
  const samples: ParsedSample[] = []; const seen = new Set<string>();
  SAMPLE_RE.lastIndex = 0;
  let m;
  while ((m = SAMPLE_RE.exec(text)) !== null) {
    const id = `s-${m[1]}-${m[2]}`;
    if (!seen.has(id)) { seen.add(id); samples.push({ id, title: m[2].replace(/\.wav$/i, "").replace(/\s*-\s*/g, " — "), category: m[1], audioPath: m[0] }); }
  }
  return samples;
}
function encodePath(p: string) { return p.split("/").map(encodeURIComponent).join("/"); }
function fmt(s: number) { if (!s || !isFinite(s)) return "0:00"; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; }

// Category color mapping
const CAT_COLORS: Record<string, string> = {
  kicks: "#C46B5A", snares: "#B8805A", hats: "#CFA24B", "hi-hats": "#CFA24B",
  claps: "#C49B6B", percussion: "#B87A56", loops: "#7B9E84", pads: "#6B8FC4",
  bass: "#6B8FC4", leads: "#C49B6B", fx: "#9B8EC4", vocals: "#7BAF6B",
  risers: "#9B8EC4", impacts: "#C46B5A", textures: "#7B9E84",
};
function catColor(cat: string) { return CAT_COLORS[cat.toLowerCase()] || "#CFA24B"; }

// --- Components ---

function SampleRow({ sample, apiUrl, audio }: { sample: ParsedSample | CatalogSample; audio: ReturnType<typeof useAudio>; apiUrl: string }) {
  const path = "audioPath" in sample ? sample.audioPath : sample.path;
  const url = `${apiUrl}/${encodePath(path)}`;
  const id = sample.id;
  const playing = audio.isPlaying(id);
  const active = audio.playingId === id;
  const progress = active && audio.dur > 0 ? audio.cur / audio.dur : 0;
  const color = catColor("category" in sample ? sample.category : "");

  return (
    <div style={{
      padding: "8px 12px", borderRadius: 8, marginBottom: 2, transition: "background 0.15s",
      background: active ? "rgba(207,162,75,0.08)" : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => audio.play(id, url)} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: playing ? "#CFA24B" : "#5E584E",
          textShadow: playing ? "0 0 8px rgba(207,162,75,0.5)" : "none", flexShrink: 0, width: 16, textAlign: "center",
        }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span style={{ flex: 1, fontSize: 12, color: active ? "#E8E2D9" : "#A09888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sample.title}
        </span>
        <span style={{ fontSize: 9, fontFamily: "var(--fm)", padding: "2px 6px", borderRadius: 4, background: `${color}20`, color, flexShrink: 0 }}>
          {"category" in sample ? sample.category : ""}
        </span>
        {active && audio.dur > 0 && (
          <span style={{ fontSize: 10, fontFamily: "var(--fm)", color: "#5E584E", flexShrink: 0 }}>
            {fmt(audio.cur)}/{fmt(audio.dur)}
          </span>
        )}
      </div>
      {active && (
        <div onClick={e => { const r = e.currentTarget.getBoundingClientRect(); audio.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }}
          style={{ height: 3, background: "rgba(232,226,217,0.06)", borderRadius: 2, marginTop: 6, cursor: "pointer", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, #CFA24B, #7B9E84)", borderRadius: 2, transition: "width 0.1s linear" }} />
        </div>
      )}
    </div>
  );
}

export default function SampleBrowser({ apiUrl }: Props) {
  const [tab, setTab] = useState<"chat" | "browse">("chat");
  const [input, setInput] = useState("");
  const { messages, send, streaming } = useChat(apiUrl);
  const audio = useAudio();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Browse state
  const [tree, setTree] = useState<CatalogTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Load catalog when browse tab is first opened
  useEffect(() => {
    if (tab === "browse" && !tree && !treeLoading) {
      setTreeLoading(true);
      fetch(`${apiUrl}/catalog/tree`)
        .then(r => r.json())
        .then((data: CatalogTree) => { setTree(data); setTreeLoading(false); })
        .catch(() => setTreeLoading(false));
    }
  }, [tab, tree, treeLoading, apiUrl]);

  const handleSend = () => {
    const t = input.trim();
    if (!t || streaming) return;
    setInput("");
    send(t);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0 }}>
        {(["chat", "browse"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid",
            background: tab === t ? "rgba(207,162,75,0.15)" : "transparent",
            borderColor: tab === t ? "rgba(207,162,75,0.30)" : "rgba(232,226,217,0.06)",
            color: tab === t ? "#CFA24B" : "#5E584E", transition: "all 0.15s",
          }}>
            {t === "chat" ? "Ask AI" : "Browse Library"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontFamily: "var(--fm)", color: "#5E584E", alignSelf: "center" }}>
          {tree ? `${tree.total_samples} samples` : ""}
        </span>
      </div>

      {tab === "chat" ? (
        /* ─── CHAT VIEW ─── */
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: "#5E584E", fontSize: 13 }}>Describe a sound you&apos;re looking for</p>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                  {["punchy kicks", "dark pads", "vinyl percussion", "808 bass"].map(q => (
                    <button key={q} onClick={() => { setInput(q); }} style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                      background: "rgba(232,226,217,0.03)", border: "1px solid rgba(232,226,217,0.06)", color: "#A09888",
                    }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div style={{ alignSelf: "flex-end", background: "rgba(207,162,75,0.15)", border: "1px solid rgba(207,162,75,0.25)", borderRadius: "12px 12px 4px 12px", padding: "8px 14px", fontSize: 13, color: "#E8E2D9", maxWidth: "80%", marginLeft: "auto" }}>
                    {msg.content}
                  </div>
                ) : (
                  <div>
                    {msg.toolCalls?.map((tool, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 10, fontFamily: "var(--fm)", color: "#5E584E", marginBottom: 4 }}>
                        {tool.status === "running" ? (
                          <div style={{ width: 10, height: 10, border: "1.5px solid #CFA24B", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                        ) : (
                          <span style={{ color: "#7B9E84" }}>✓</span>
                        )}
                        <span>{tool.name}({Object.keys(tool.args).map(k => `${k}="${tool.args[k]}"`).join(", ")})</span>
                        {tool.duration_ms && <span style={{ color: "#5E584E" }}>{tool.duration_ms}ms</span>}
                      </div>
                    ))}
                    {msg.content && (() => {
                      const samples = parseSamples(msg.content);
                      const cleanText = msg.content.replace(/`audio:\s*samples\/library\/.+?\.wav`/g, "").replace(/^\s*samples\/library\/.+?\.wav\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
                      return (
                        <>
                          {cleanText && <div style={{ fontSize: 13, color: "#A09888", lineHeight: 1.6, padding: "4px 0" }}>{cleanText}</div>}
                          {samples.map(s => <SampleRow key={s.id} sample={s} apiUrl={apiUrl} audio={audio} />)}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(232,226,217,0.06)", flexShrink: 0 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="Describe a sound..." disabled={streaming}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13, outline: "none",
                background: "#1E1C19", border: "1px solid rgba(232,226,217,0.06)", color: "#E8E2D9",
                fontFamily: "var(--fb)",
              }}
            />
            <button onClick={handleSend} disabled={streaming} style={{
              padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: streaming ? "default" : "pointer",
              background: streaming ? "#28261F" : "#7B9E84", color: streaming ? "#5E584E" : "#0D0C0A",
              border: "none", transition: "all 0.15s",
            }}>
              {streaming ? "..." : "Search"}
            </button>
          </div>
        </div>
      ) : (
        /* ─── BROWSE VIEW ─── */
        <div style={{ flex: 1, overflowY: "auto" }}>
          {treeLoading && <p style={{ color: "#5E584E", fontSize: 12, textAlign: "center", padding: 20 }}>Loading catalog...</p>}
          {tree && Object.keys(tree.categories).sort().map(cat => {
            const samples = tree.categories[cat];
            const open = !!expanded[cat];
            const color = catColor(cat);
            return (
              <div key={cat}>
                <div onClick={() => setExpanded(p => ({ ...p, [cat]: !p[cat] }))}
                  style={{
                    padding: "8px 12px", cursor: "pointer", borderRadius: 8, display: "flex", alignItems: "center", gap: 8,
                    transition: "background 0.15s", background: open ? "rgba(232,226,217,0.04)" : "transparent",
                  }}>
                  <span style={{ fontSize: 10, width: 12, textAlign: "center", color: "#5E584E" }}>{open ? "▾" : "▸"}</span>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#E8E2D9" }}>{cat}</span>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "#5E584E", marginLeft: "auto" }}>({samples.length})</span>
                </div>
                {open && (
                  <div style={{ paddingLeft: 20 }}>
                    {samples.map(s => <SampleRow key={s.id} sample={s} apiUrl={apiUrl} audio={audio} />)}
                  </div>
                )}
              </div>
            );
          })}
          {tree && Object.keys(tree.categories).length === 0 && (
            <p style={{ color: "#5E584E", fontSize: 12, textAlign: "center", padding: 20 }}>No samples found. Is the chatbot server running?</p>
          )}
        </div>
      )}
    </div>
  );
}
