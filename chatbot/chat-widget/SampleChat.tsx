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
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
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
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantMsg: Message = { role: "assistant", content: "", toolCalls: [] };
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

// --- Main Component ---

export default function SampleChat({
  apiUrl,
  title = "Sample Agent",
  placeholder = "Describe a sound...",
  accentColor = "#6c63ff",
}: SampleChatProps) {
  const [isOpen, setIsOpen] = useState(false);
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
          <div style={{ ...STYLES.header, background: accentColor }}>{title}</div>
          <div style={STYLES.messages}>
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div style={{ ...STYLES.userMsg, background: accentColor }}>{msg.content}</div>
                ) : (
                  <div>
                    {msg.toolCalls?.map((tool, j) => (
                      <ToolTraceCard key={j} tool={tool} />
                    ))}
                    {msg.content && <div style={STYLES.assistantMsg}>{msg.content}</div>}
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
              style={{ ...STYLES.sendBtn, background: accentColor, opacity: isStreaming ? 0.5 : 1 }}
              onClick={handleSend}
              disabled={isStreaming}
            >
              {isStreaming ? "..." : "Send"}
            </button>
          </div>
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
