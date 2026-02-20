"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { Send, Paperclip, Wifi, WifiOff, Loader2 } from "lucide-react";

const RELAY_URL = "wss://overclaw-api-production.up.railway.app/ws/web";
const PROXY_URL = "https://overclaw-api-production.up.railway.app";

interface PreflightEstimate {
  costExplanation: string;
  plan: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedInternalTokens: number;
}

async function getPreflightEstimate(message: string, apiKey: string): Promise<PreflightEstimate> {
  const prompt = `You are a task cost estimator for an AI assistant app. Given a user's task, estimate the cost in internal app tokens. Respond ONLY with valid JSON, no other text.

Fields:
- "costExplanation": One sentence explaining what this task will cost in simple terms
- "plan": 2-3 sentences describing how the AI will approach this task
- "estimatedInputTokens": estimated input tokens needed (integer)
- "estimatedOutputTokens": estimated output tokens the response will use (integer)
- "estimatedInternalTokens": calculated as ceil((estimatedInputTokens * 0.015) + (estimatedOutputTokens * 0.06))

User task: ${message.slice(0, 500)}`;

  try {
    const resp = await fetch(`${PROXY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "overclaw/auto",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      }),
    });
    if (!resp.ok) throw new Error(`Proxy ${resp.status}`);
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    return {
      costExplanation: parsed.costExplanation || "This task will use a small amount of tokens.",
      plan: parsed.plan || "The AI will process your request and respond.",
      estimatedInputTokens: parsed.estimatedInputTokens || Math.ceil(message.length / 4),
      estimatedOutputTokens: parsed.estimatedOutputTokens || Math.ceil(message.length / 2),
      estimatedInternalTokens: parsed.estimatedInternalTokens || 1,
    };
  } catch (e) {
    console.warn("[Chat] Preflight estimate failed:", e);
    const inputEst = Math.ceil(message.length / 4);
    const outputEst = Math.ceil(inputEst * 2);
    return {
      costExplanation: "This task will use a small amount of tokens.",
      plan: "The AI will process your request and respond.",
      estimatedInputTokens: inputEst,
      estimatedOutputTokens: outputEst,
      estimatedInternalTokens: Math.ceil((inputEst * 0.015) + (outputEst * 0.06)),
    };
  }
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type DeviceState = "connecting" | "online" | "offline" | "disconnected";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [deviceState, setDeviceState] = useState<DeviceState>("connecting");
  const [userInitial, setUserInitial] = useState("U");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<null | { text: string; estimate: PreflightEstimate }>(null);
  const [estimating, setEstimating] = useState(false);
  const [thoughtText, setThoughtText] = useState("");
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  // Fetch user profile
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const u = session.user;
      // Try auth metadata first, then email
      const name = u.user_metadata?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email || "";
      if (name) setUserInitial(name.charAt(0).toUpperCase());
      // Try profile table for avatar
      const { data } = await supabase.from("profiles").select("avatar_url").eq("id", u.id).single();
      if (data?.avatar_url) setUserAvatar(data.avatar_url);
    })();
  }, []);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  // Single WebSocket connection with proper lifecycle
  useEffect(() => {
    mountedRef.current = true;

    async function connect() {
      if (!mountedRef.current || connectingRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
      connectingRef.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !mountedRef.current) { connectingRef.current = false; return; }

        const resp = await fetch("https://overclaw-api-production.up.railway.app/api/proxy/apikey", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!resp.ok || !mountedRef.current) {
          connectingRef.current = false;
          setDeviceState("disconnected");
          return;
        }
        const { apiKey } = await resp.json();
        if (!apiKey || !mountedRef.current) { connectingRef.current = false; return; }
        apiKeyRef.current = apiKey;

        const ws = new WebSocket(`${RELAY_URL}?key=${encodeURIComponent(apiKey)}`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[Relay] WS open");
          connectingRef.current = false;
        };

        ws.onmessage = (ev) => {
          if (!mountedRef.current) return;
          let msg: any;
          try { msg = JSON.parse(String(ev.data)); } catch { return; }
          console.log("[Relay]", msg.type);

          switch (msg.type) {
            case "relay.connected":
              setDeviceState(msg.deviceOnline ? "online" : "offline");
              ws.send(JSON.stringify({ type: "relay.history_request", id: "init" }));
              break;
            case "relay.device_online":
              setDeviceState("online");
              break;
            case "relay.device_offline":
              setDeviceState("offline");
              break;
            case "relay.chat_delta":
              // Route deltas to thought box — only final goes in chat
              setThoughtText(msg.text || "");
              setStreaming(true);
              break;
            case "relay.chat_final":
              if (msg.text) {
                setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: msg.text }]);
              }
              setStreaming(false);
              setStreamText("");
              setThoughtText("");
              setThoughtExpanded(false);
              break;
            case "relay.chat_error":
              setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: `Error: ${msg.message}` }]);
              setStreaming(false);
              setStreamText("");
              setThoughtText("");
              setThoughtExpanded(false);
              break;
            case "relay.status":
              if (msg.status === "idle") {
                // Capture any accumulated thought text as final message
                setThoughtText(prev => {
                  if (prev) {
                    setMessages(msgs => [...msgs, { id: `a-${Date.now()}`, role: "assistant", content: prev }]);
                  }
                  return "";
                });
                setStreaming(false);
                setThoughtExpanded(false);
              }
              break;
            case "relay.history":
              if (msg.messages?.length) {
                setMessages(msg.messages.map((m: any, i: number) => ({
                  id: `h-${i}`,
                  role: m.role as "user" | "assistant",
                  content: m.content,
                })));
              }
              break;
          }
        };

        ws.onclose = () => {
          console.log("[Relay] WS closed");
          connectingRef.current = false;
          wsRef.current = null;
          if (mountedRef.current) {
            setDeviceState("disconnected");
            reconnectRef.current = setTimeout(connect, 5000);
          }
        };

        ws.onerror = () => {
          console.error("[Relay] WS error");
          connectingRef.current = false;
        };
      } catch (e) {
        console.error("[Relay] Connect failed:", e);
        connectingRef.current = false;
        if (mountedRef.current) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const executeSend = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setThoughtText("");
    setThoughtExpanded(false);
    wsRef.current?.send(JSON.stringify({ type: "relay.send", text, id: Date.now().toString() }));
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming || estimating || deviceState !== "online") return;

    setEstimating(true);
    try {
      const estimate = await getPreflightEstimate(text, apiKeyRef.current || "");
      setPendingConfirm({ text, estimate });
    } catch {
      // If estimate fails, proceed directly
      executeSend(text);
    } finally {
      setEstimating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const online = deviceState === "online";
  const hasMessages = messages.length > 0 || streaming;

  const statusLabel = deviceState === "online" ? "Desktop connected" : deviceState === "connecting" ? "Connecting..." : deviceState === "offline" ? "Desktop offline" : "Disconnected";
  const statusColor = deviceState === "online" ? "#22C55E" : deviceState === "connecting" ? "#EAB308" : "#EF4444";

  return (
    <div className="chat-page-enter" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
      {/* Header */}
      <div style={{ height: "56px", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Image src="/logo.jpg" alt="OverClaw" width={28} height={28} style={{ borderRadius: "8px" }} />
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>OverClaw</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
          {online ? <Wifi size={14} style={{ color: statusColor }} /> : <WifiOff size={14} style={{ color: statusColor }} />}
          <span style={{ fontSize: "12px", color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {!hasMessages ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "var(--accent-bg-10)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
              <Image src="/logo.jpg" alt="OverClaw" width={32} height={32} style={{ borderRadius: "8px" }} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
              {online ? "How can I help you today?" : "Waiting for your desktop app..."}
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", maxWidth: "400px" }}>
              {online ? "Send a message — it'll appear in your desktop app and the response streams back here." : "Open the OverClaw desktop app to start chatting."}
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: "720px", width: "100%", margin: "0 auto", padding: "24px 20px" }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", gap: "12px", marginBottom: "24px", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                {msg.role === "assistant" && (
                  <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "var(--accent-bg-10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Image src="/logo.jpg" alt="" width={20} height={20} style={{ borderRadius: "5px" }} />
                  </div>
                )}
                <div style={{
                  maxWidth: "75%", padding: "12px 18px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user" ? "var(--accent)" : "var(--card-bg, rgba(255,255,255,0.03))",
                  color: msg.role === "user" ? "white" : "var(--text-primary)",
                  border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                  fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  userAvatar ? (
                    <Image src={userAvatar} alt="" width={32} height={32} style={{ width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "13px", color: "white", fontWeight: 600 }}>
                      {userInitial}
                    </div>
                  )
                )}
              </div>
            ))}

            {streaming && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "var(--accent-bg-10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Image src="/logo.jpg" alt="" width={20} height={20} style={{ borderRadius: "5px" }} />
                </div>
                <div style={{ maxWidth: "75%", width: "100%" }}>
                  {/* Loading spinner */}
                  <div style={{
                    padding: "12px 18px", borderRadius: "18px 18px 18px 4px",
                    background: "var(--card-bg, rgba(255,255,255,0.03))", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div className="typing-dot" style={{ animationDelay: "0ms" }} />
                      <div className="typing-dot" style={{ animationDelay: "150ms" }} />
                      <div className="typing-dot" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                  {/* Thought/process box */}
                  {thoughtText && (
                    <div style={{ marginTop: "8px", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
                      <button
                        onClick={() => setThoughtExpanded(prev => !prev)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", fontSize: "11px", fontWeight: 500, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <span style={{ transform: thoughtExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                        Thinking &amp; Process
                      </button>
                      {thoughtExpanded && (
                        <div style={{ padding: "0 12px 10px", fontSize: "11px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--text-muted)", maxHeight: "200px", overflowY: "auto", fontFamily: "monospace" }}>
                          {thoughtText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>
        )}
      </div>

      {/* Preflight cost estimate modal */}
      {pendingConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, borderRadius: 14, border: "1px solid var(--border)", background: "var(--card-bg, #111)", padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Cost Estimate</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
              {pendingConfirm.estimate.costExplanation}
            </p>
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Plan</div>
              {pendingConfirm.estimate.plan}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              <div>Input: <strong>{pendingConfirm.estimate.estimatedInputTokens}</strong></div>
              <div>Output: <strong>{pendingConfirm.estimate.estimatedOutputTokens}</strong></div>
              <div>Est. cost: <strong>{pendingConfirm.estimate.estimatedInternalTokens} tokens</strong></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setPendingConfirm(null)} style={{ borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>
                Don&apos;t proceed
              </button>
              <button onClick={() => { const p = pendingConfirm; setPendingConfirm(null); if (p) executeSend(p.text); }} style={{ borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estimating overlay */}
      {estimating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: "var(--card-bg, #111)", border: "1px solid var(--border)" }}>
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Estimating cost...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "16px 20px 24px", flexShrink: 0 }}>
        <div className="auth-input" style={{
          maxWidth: "720px", margin: "0 auto", borderRadius: "20px",
          border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
          overflow: "hidden", opacity: online ? 1 : 0.5,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={online ? "Message OverClaw..." : "Desktop app not connected..."}
            disabled={!online}
            rows={1}
            style={{ width: "100%", padding: "16px 20px 8px", background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: "14px", resize: "none", maxHeight: "120px", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px 12px" }}>
            <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "6px", borderRadius: "8px", display: "flex" }}>
              <Paperclip size={18} />
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming || estimating || !online}
              style={{
                width: "32px", height: "32px", borderRadius: "10px", border: "none",
                background: input.trim() && !streaming && !estimating && online ? "var(--accent)" : "var(--border)",
                color: input.trim() && !streaming && !estimating && online ? "white" : "var(--text-muted)",
                cursor: input.trim() && !streaming && !estimating && online ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease",
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
          Messages are relayed to your desktop app. OverClaw can make mistakes.
        </p>
      </div>
    </div>
  );
}
