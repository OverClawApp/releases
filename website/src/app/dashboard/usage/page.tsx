"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Coins, Activity, Zap, BarChart3, Loader2, Clock, Cpu, ArrowUpRight, Bot, GitBranch } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";


const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";

// --- Agent topology (relay-powered) ---

interface AgentNode {
  name: string;
  role: string;
  emoji: string;
  status: "online" | "offline";
}

function useAgentTopology() {
  const [mainAgent, setMainAgent] = useState<AgentNode | null>(null);
  const [subAgents, setSubAgents] = useState<AgentNode[]>([]);
  const [deviceOnline, setDeviceOnline] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`${RAILWAY_URL}/api/proxy/apikey`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const { apiKey } = await res.json();
        if (!apiKey) return;

        ws = new WebSocket(`wss://overclaw-api-production.up.railway.app/ws/web`);
        const pendingRpc = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
        let idCounter = 0;

        const rpc = (method: string, params: any): Promise<any> =>
          new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("Not connected"));
            const rpcId = `rpc_${++idCounter}_${Date.now()}`;
            pendingRpc.set(rpcId, { resolve, reject });
            ws.send(JSON.stringify({ type: "relay.rpc_request", rpcId, method, params }));
            setTimeout(() => { if (pendingRpc.has(rpcId)) { pendingRpc.delete(rpcId); reject(new Error("timeout")); } }, 10000);
          });

        ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", key: apiKey }));
        ws.onmessage = async (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "relay.connected") {
              setDeviceOnline(!!msg.deviceOnline);
              if (msg.deviceOnline) loadTopology(rpc);
            }
            if (msg.type === "relay.device_online") { setDeviceOnline(true); loadTopology(rpc); }
            if (msg.type === "relay.device_offline") { setDeviceOnline(false); setMainAgent(null); setSubAgents([]); }
            if (msg.type === "relay.rpc_response" && msg.rpcId) {
              const p = pendingRpc.get(msg.rpcId);
              if (p) { pendingRpc.delete(msg.rpcId); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result); }
            }
          } catch {}
        };
        ws.onclose = () => { if (!closed) setTimeout(connect, 5000); };
      } catch {}
    };

    const ROLE_EMOJIS: Record<string, string> = {
      orchestrator: "🎯", programmer: "💻", artist: "🎨",
      researcher: "🔍", writer: "✍️", "data-analyst": "📊",
    };

    async function loadTopology(rpc: (m: string, p: any) => Promise<any>) {
      // Read main agent SOUL.md to infer role
      try {
        const soul = await rpc("exec", { command: "cat ~/.overclaw/cloud/workspace/SOUL.md 2>/dev/null || echo ''" });
        const soulText = typeof soul === "string" ? soul : soul?.stdout || soul?.output || "";
        let role = "Custom";
        let emoji = "🤖";
        for (const [key, em] of Object.entries(ROLE_EMOJIS)) {
          if (soulText.toLowerCase().includes(key)) { role = key.charAt(0).toUpperCase() + key.slice(1).replace("-", " "); emoji = em; break; }
        }
        setMainAgent({ name: "Main Agent", role, emoji, status: "online" });
      } catch {
        setMainAgent({ name: "Main Agent", role: "Unknown", emoji: "🤖", status: "online" });
      }

      // Read sub-agent registry
      try {
        const reg = await rpc("exec", { command: "cat ~/.overclaw/cloud/workspace/subagents/registry.json 2>/dev/null || echo '[]'" });
        const regText = typeof reg === "string" ? reg : reg?.stdout || reg?.output || "[]";
        const agents: any[] = JSON.parse(regText);
        setSubAgents(agents.map((a: any) => ({
          name: a.name || "Unnamed",
          role: a.template ? a.template.charAt(0).toUpperCase() + a.template.slice(1).replace("-", " ") : "Custom",
          emoji: ROLE_EMOJIS[a.template] || "🤖",
          status: "offline" as const,
        })));
      } catch {
        setSubAgents([]);
      }
    }

    connect();
    return () => { closed = true; ws?.close(); };
  }, []);

  return { mainAgent, subAgents, deviceOnline };
}

interface UsageLog {
  id: string;
  user_id: string;
  tokens_used: number;
  model: string;
  created_at: string;
  request_type?: string;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
  n.toString();

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default function UsagePage() {
  const { mainAgent, subAgents, deviceOnline } = useAgentTopology();
  const [balance, setBalance] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError("Not signed in");
          setLoading(false);
          return;
        }
        const headers = { Authorization: `Bearer ${session.access_token}` };

        const [balRes, usageRes] = await Promise.all([
          fetch(`${RAILWAY_URL}/api/proxy/balance`, { headers }),
          fetch(`${RAILWAY_URL}/api/proxy/usage`, { headers }),
        ]);

        if (balRes.ok) {
          const b = await balRes.json();
          setBalance(b.balance ?? 0);
        }
        if (usageRes.ok) {
          const u = await usageRes.json();
          setUsage(u.usage ?? []);
        }
      } catch {
        setError("Failed to load usage data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalTokens = usage.reduce((sum, u) => sum + (u.tokens_used || 0), 0);
  const totalRequests = usage.length;

  // Group by model
  const byModel: Record<string, { count: number; tokens: number }> = {};
  for (const u of usage) {
    const m = u.model || "unknown";
    if (!byModel[m]) byModel[m] = { count: 0, tokens: 0 };
    byModel[m].count++;
    byModel[m].tokens += u.tokens_used || 0;
  }
  const modelBreakdown = Object.entries(byModel)
    .sort((a, b) => b[1].tokens - a[1].tokens);

  // Usage over last 7 days
  const last7: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const dayTokens = usage
      .filter(u => u.created_at?.startsWith(dayStr))
      .reduce((sum, u) => sum + (u.tokens_used || 0), 0);
    last7.push(dayTokens);
  }
  const maxDay = Math.max(...last7, 1);

  return (
    <div style={{ padding: "40px", maxWidth: "960px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <BarChart3 size={20} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>Usage</h1>
        {loading && <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)", marginLeft: "8px" }} />}
      </div>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "32px" }}>
        Track your token usage and API requests.
      </p>

      {/* Agent Topology */}
      <div style={{
        padding: "24px", borderRadius: "16px", marginBottom: "24px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <GitBranch size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Agent Topology</span>
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: deviceOnline ? "#22C55E" : "#EF4444" }} />
            <span style={{ fontSize: "11px", color: deviceOnline ? "#22C55E" : "var(--text-muted)" }}>
              {deviceOnline ? "Desktop connected" : "Desktop offline"}
            </span>
          </div>
        </div>

        {!deviceOnline ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Bot size={24} style={{ color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 8px" }} />
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Connect your desktop app to view agent topology</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0" }}>
            {/* Main agent */}
            {mainAgent && (
              <div style={{
                padding: "16px 24px", borderRadius: "14px",
                border: "2px solid var(--accent)", background: "rgba(239,68,68,0.04)",
                display: "flex", alignItems: "center", gap: "12px", minWidth: "240px",
              }}>
                <span style={{ fontSize: "24px" }}>{mainAgent.emoji}</span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{mainAgent.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22C55E" }} />
                    {mainAgent.role}
                  </div>
                </div>
              </div>
            )}

            {/* Connection lines + sub-agents */}
            {subAgents.length > 0 && (
              <>
                {/* Vertical connector */}
                <div style={{ width: "2px", height: "20px", background: "var(--border)" }} />

                {/* Horizontal branch bar */}
                {subAgents.length > 1 && (
                  <div style={{
                    height: "2px", background: "var(--border)",
                    width: `${Math.min(subAgents.length * 160, 640)}px`,
                    maxWidth: "100%",
                  }} />
                )}

                {/* Sub-agent cards */}
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: "12px",
                  justifyContent: "center", marginTop: subAgents.length > 1 ? "0" : "0",
                }}>
                  {subAgents.map((agent, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      {/* Vertical connector from branch */}
                      {subAgents.length > 1 && (
                        <div style={{ width: "2px", height: "12px", background: "var(--border)" }} />
                      )}
                      <div style={{
                        padding: "12px 18px", borderRadius: "12px",
                        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
                        display: "flex", alignItems: "center", gap: "10px", minWidth: "140px",
                        transition: "border-color 0.2s ease",
                      }}>
                        <span style={{ fontSize: "18px" }}>{agent.emoji}</span>
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{agent.name}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{agent.role}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {subAgents.length === 0 && mainAgent && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                  No sub-agents deployed. Add them in <a href="/dashboard/bots" style={{ color: "var(--accent)", textDecoration: "none" }}>Bots</a>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && !loading ? (
        <div style={{
          padding: "48px", borderRadius: "16px", border: "1px solid var(--border)",
          background: "var(--card-bg, rgba(255,255,255,0.02))", textAlign: "center",
        }}>
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>{error}</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
            {[
              { label: "Token Balance", value: balance !== null ? fmt(balance) : "—", icon: Coins, color: "var(--accent)" },
              { label: "Tokens Used", value: fmt(totalTokens), icon: Activity, color: "#F59E0B" },
              { label: "Requests", value: totalRequests.toString(), icon: Zap, color: "#8B5CF6" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="security-card" style={{
                  padding: "24px", borderRadius: "16px",
                  border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      {s.label}
                    </span>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: `${s.color}15`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={16} style={{ color: s.color }} />
                    </div>
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)" }}>{s.value}</div>
                </div>
              );
            })}
          </div>

          {/* 7-day chart + Model breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            {/* Mini bar chart */}
            <div style={{
              padding: "24px", borderRadius: "16px",
              border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                Last 7 Days
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px" }}>
                {last7.map((v, i) => {
                  const h = Math.max((v / maxDay) * 100, 4);
                  const d = new Date();
                  d.setDate(d.getDate() - (6 - i));
                  const day = d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{
                        width: "100%", borderRadius: "4px",
                        height: `${h}%`, minHeight: "3px",
                        background: v > 0 ? "var(--accent)" : "var(--border)",
                        transition: "height 0.3s ease",
                      }} />
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{day}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px" }}>
                {fmt(last7.reduce((a, b) => a + b, 0))} tokens this week
              </div>
            </div>

            {/* Model breakdown */}
            <div style={{
              padding: "24px", borderRadius: "16px",
              border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                By Model
              </div>
              {modelBreakdown.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No usage yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {modelBreakdown.slice(0, 5).map(([model, data]) => {
                    const pct = totalTokens > 0 ? (data.tokens / totalTokens) * 100 : 0;
                    return (
                      <div key={model}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            <Cpu size={10} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle", color: "var(--text-muted)" }} />
                            {model}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {fmt(data.tokens)} · {data.count} req{data.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "2px", background: "var(--border)" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%", borderRadius: "2px",
                            background: "var(--accent)", transition: "width 0.3s ease",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div style={{
            padding: "24px", borderRadius: "16px",
            border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
              Recent Activity
            </div>
            {usage.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
                No usage data yet. Start chatting to see your activity here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {usage.slice(0, 20).map((u, i) => (
                  <div key={u.id || i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 0",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "7px",
                        background: "var(--accent)15",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <ArrowUpRight size={13} style={{ color: "var(--accent)" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                          {u.model || "API Request"}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          <Clock size={9} style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />
                          {fmtDate(u.created_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {fmt(u.tokens_used || 0)}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>tokens</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
