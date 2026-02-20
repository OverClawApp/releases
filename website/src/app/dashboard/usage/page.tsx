"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Coins, Activity, Zap, BarChart3, Loader2, Clock, Cpu, ArrowDownRight, ArrowUpRight } from "lucide-react";


const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";

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
