"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bot, RefreshCw, Circle, Activity } from "lucide-react";

const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";

interface SessionItem {
  sessionKey: string;
  label?: string;
  kind?: string;
  updatedAt?: string;
  messages?: Array<{ role?: string; content?: string }>;
}

function useGatewayRelay() {
  const wsRef = useRef<WebSocket | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const pendingRef = useRef<Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>>(new Map());
  const idCounter = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`${RAILWAY_URL}/api/proxy/apikey`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const { apiKey } = await res.json();
        if (!apiKey) return;

        ws = new WebSocket(`wss://overclaw-api-production.up.railway.app/ws/web`);
        wsRef.current = ws;

        ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", key: apiKey }));
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "relay.connected") { setDeviceOnline(!!msg.deviceOnline); setConnected(true); }
            if (msg.type === "relay.device_online") setDeviceOnline(true);
            if (msg.type === "relay.device_offline") setDeviceOnline(false);
            if (msg.type === "relay.rpc_response" && msg.rpcId) {
              const pending = pendingRef.current.get(msg.rpcId);
              if (pending) {
                pendingRef.current.delete(msg.rpcId);
                if (msg.error) pending.reject(new Error(msg.error));
                else pending.resolve(msg.result);
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          setConnected(false);
          if (!closed) setTimeout(connect, 5000);
        };
      } catch {}
    };

    connect();
    return () => { closed = true; ws?.close(); };
  }, []);

  const rpc = useCallback((method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("Not connected"));
      const rpcId = `rpc_${++idCounter.current}_${Date.now()}`;
      pendingRef.current.set(rpcId, { resolve, reject });
      ws.send(JSON.stringify({ type: "relay.rpc_request", rpcId, method, params }));
      setTimeout(() => {
        if (pendingRef.current.has(rpcId)) {
          pendingRef.current.delete(rpcId);
          reject(new Error("RPC timeout"));
        }
      }, 15000);
    });
  }, []);

  return { deviceOnline, connected, rpc };
}

function relTime(ts?: string) {
  if (!ts) return "unknown";
  const d = new Date(ts).getTime();
  if (!Number.isFinite(d)) return "unknown";
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function ActivityPage() {
  const relay = useGatewayRelay();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionApiUnavailable, setSessionApiUnavailable] = useState(false);
  const [fallbackActivities, setFallbackActivities] = useState<Array<{ name: string; status: string; updatedAt?: number }>>([]);

  const load = useCallback(async () => {
    if (!relay.deviceOnline) return;
    setLoading(true);
    setErr(null);
    try {
      let result: any;
      try {
        result = await relay.rpc("sessions.list", { limit: 50 });
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (msg.toLowerCase().includes("unknown method")) {
          setSessionApiUnavailable(true);
          // Fallback: show running cron jobs as current background activity
          try {
            const c = await relay.rpc("cron.list", { includeDisabled: true });
            const jobs = (c?.jobs || c || []).map((j: any) => ({
              name: j?.name || j?.payload?.message || "Background task",
              status: j?.state?.runningAtMs ? "Running" : "Idle",
              updatedAt: j?.state?.runningAtMs || j?.state?.lastRunAtMs,
            }));
            setFallbackActivities(jobs);
            setSessions([]);
            return;
          } catch {}
        }
        throw e;
      }
      const list = (result?.sessions || result || []) as SessionItem[];
      setSessionApiUnavailable(false);
      setSessions(list);
    } catch (e: any) {
      setErr(e?.message || "Failed to load session activity");
    } finally {
      setLoading(false);
    }
  }, [relay]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ padding: "28px", maxWidth: "980px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", color: "var(--text-primary)" }}>Agent Activity</h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            Live view of what the main agent and sub-agents are currently doing.
          </p>
        </div>
        <button onClick={load} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", borderRadius: "10px", padding: "8px 12px", cursor: "pointer" }}>
          <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} /> Refresh
        </button>
      </div>

      <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: relay.deviceOnline ? "#22c55e" : "#f59e0b" }}>
        <Circle size={10} fill="currentColor" /> {relay.deviceOnline ? "Device online" : "Device offline"} {relay.connected ? "· relay connected" : "· relay connecting"}
      </div>

      {err && <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{err}</div>}
      {sessionApiUnavailable && (
        <div style={{ color: "#f59e0b", fontSize: "12px", marginBottom: "12px" }}>
          Session API not available on this gateway version. Showing background task activity instead.
        </div>
      )}

      <div style={{ display: "grid", gap: "10px" }}>
        {sessionApiUnavailable ? (
          fallbackActivities.length === 0 ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", color: "var(--text-muted)", fontSize: "13px" }}>
              No background activity yet.
            </div>
          ) : fallbackActivities.map((a, i) => (
            <div key={`${a.name}-${i}`} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>{a.name}</span>
                <span style={{ fontSize: "11px", color: a.status === "Running" ? "#22c55e" : "var(--text-muted)" }}>{a.status}</span>
              </div>
            </div>
          ))
        ) : sessions.length === 0 && !loading ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", color: "var(--text-muted)", fontSize: "13px" }}>
            No active session data yet.
          </div>
        ) : sessions.map((s) => {
          const last = s.messages?.[0]?.content || "No recent message";
          const recent = s.updatedAt && (Date.now() - new Date(s.updatedAt).getTime()) < 120000;
          return (
            <div key={s.sessionKey} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Bot size={14} style={{ color: "var(--text-muted)" }} />
                  <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>{s.label || s.kind || "Session"}</span>
                  <span style={{ fontSize: "11px", color: recent ? "#22c55e" : "var(--text-muted)" }}>
                    {recent ? "Active now" : "Idle"}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{relTime(s.updatedAt)}</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                {String(last).slice(0, 220)}
              </div>
              <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--text-muted)" }}>{s.sessionKey}</div>
            </div>
          );
        })}
      </div>

      {loading && (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
          <Activity size={13} style={{ display: "inline", marginRight: 6 }} /> Updating...
        </div>
      )}
    </div>
  );
}
