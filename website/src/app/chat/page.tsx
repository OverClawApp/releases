"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { Send, Paperclip, Wifi, WifiOff } from "lucide-react";

const RELAY_URL = "wss://overclaw-api-production.up.railway.app/ws/web";


interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type DeviceState = "connecting" | "online" | "offline" | "disconnected";

function mergeStreamText(prev: string, incoming: string): string {
  if (!incoming) return prev;
  if (!prev) return incoming;
  if (incoming.startsWith(prev)) return incoming;
  if (prev.startsWith(incoming)) return prev;
  return prev + incoming;
}

function estimateInternalTokenCost(message: string) {
  const approxInputTokens = Math.max(1, Math.ceil(message.length / 4));
  const complexity = approxInputTokens > 350 ? "smart" : approxInputTokens > 120 ? "balanced" : "fast";
  const outputMultiplier = complexity === "smart" ? 3.5 : complexity === "balanced" ? 2.2 : 1.4;
  const approxOutputTokens = Math.max(16, Math.ceil(approxInputTokens * outputMultiplier));
  const estimatedInternalTokens = Math.ceil((approxInputTokens * 0.015) + (approxOutputTokens * 0.06));
  return { complexity, approxInputTokens, approxOutputTokens, estimatedInternalTokens };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [deviceState, setDeviceState] = useState<DeviceState>("connecting");
  const [pendingConfirm, setPendingConfirm] = useState<null | { text: string; estimate: ReturnType<typeof estimateInternalTokenCost> }>(null);
  const [userInitial, setUserInitial] = useState("U");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
              setStreamText(prev => mergeStreamText(prev, msg.text || ""));
              setStreaming(true);
              break;
            case "relay.chat_final":
              if (msg.text) {
                setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: msg.text }]);
              }
              setStreaming(false);
              setStreamText("");
              break;
            case "relay.chat_error":
              setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: `Error: ${msg.message}` }]);
              setStreaming(false);
              setStreamText("");
              break;
            case "relay.status":
              if (msg.status === "idle") {
                // Capture any accumulated stream text as final message
                setStreamText(prev => {
                  if (prev) {
                    setMessages(msgs => [...msgs, { id: `a-${Date.now()}`, role: "assistant", content: prev }]);
                  }
                  return "";
                });
                setStreaming(false);
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
    wsRef.current?.send(JSON.stringify({ type: "relay.send", text, id: Date.now().toString() }));
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming || deviceState !== "online") return;
    setPendingConfirm({ text, estimate: estimateInternalTokenCost(text) });
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
                <div style={{
                  padding: "12px 18px", borderRadius: "18px 18px 18px 4px",
                  background: "var(--card-bg, rgba(255,255,255,0.03))", border: "1px solid var(--border)",
                  fontSize: "14px", lineHeight: 1.6, minWidth: "60px", whiteSpace: "pre-wrap",
                }}>
                  {streamText || (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div className="typing-dot" style={{ animationDelay: "0ms" }} />
                      <div className="typing-dot" style={{ animationDelay: "150ms" }} />
                      <div className="typing-dot" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>
        )}
      </div>

      {pendingConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 430, borderRadius: 14, border: "1px solid var(--border)", background: "var(--card-bg, #111)", padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Estimated internal token cost</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              Preflight estimate generated with a lightweight model before task execution.
            </p>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <div>Task tier: <strong>{pendingConfirm.estimate.complexity}</strong></div>
              <div>Estimated input/output: <strong>{pendingConfirm.estimate.approxInputTokens}</strong> / <strong>{pendingConfirm.estimate.approxOutputTokens}</strong></div>
              <div>Estimated internal tokens charged: <strong>{pendingConfirm.estimate.estimatedInternalTokens}</strong></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setPendingConfirm(null)} style={{ borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", padding: "7px 10px", fontSize: 12 }}>Don't proceed</button>
              <button onClick={() => { const p = pendingConfirm; setPendingConfirm(null); if (p) executeSend(p.text); }} style={{ borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", padding: "7px 10px", fontSize: 12 }}>Continue</button>
            </div>
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
              disabled={!input.trim() || streaming || !online}
              style={{
                width: "32px", height: "32px", borderRadius: "10px", border: "none",
                background: input.trim() && !streaming && online ? "var(--accent)" : "var(--border)",
                color: input.trim() && !streaming && online ? "white" : "var(--text-muted)",
                cursor: input.trim() && !streaming && online ? "pointer" : "not-allowed",
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
