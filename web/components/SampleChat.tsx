// chat-widget/SampleChat.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

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
    whiteSpace: "pre-wrap" as const,
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

function FileBrowser({ apiUrl, accentColor }: { apiUrl: string; accentColor: string }) {
  const [tree, setTree] = useState<CatalogTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasFetched = useRef(false);

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
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "default",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                    title={sample.id}
                  >
                    <span style={{ opacity: 0.5 }}>{"\uD83D\uDCC4"}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sample.title}
                    </span>
                  </div>
                ))}
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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

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
                {messages.map((msg) => (
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
                        {msg.content && (
                          <div style={STYLES.assistantMsg}>{msg.content}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
            <FileBrowser apiUrl={apiUrl} accentColor={accentColor} />
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
