"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Clock, Play, CheckCircle2, Loader2, Trash2, X, Pause, Eye,
  Calendar, Repeat, Timer, MessageSquare, Bot, FileText, RefreshCw,
} from "lucide-react";


const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";

interface CronJob {
  jobId: string;
  name?: string;
  schedule: any;
  payload: any;
  sessionTarget: string;
  enabled: boolean;
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
  lastDurationMs?: number;
}

interface CompletedRun {
  id: string;
  jobId: string;
  jobName?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
  summary?: string;
}

type ScheduleKind = "at" | "every" | "cron";
type TabKey = "scheduled" | "active" | "completed";

const INTERVAL_PRESETS = [
  { label: "Every 5 min", ms: 5 * 60000 },
  { label: "Every 15 min", ms: 15 * 60000 },
  { label: "Every 30 min", ms: 30 * 60000 },
  { label: "Every hour", ms: 3600000 },
  { label: "Every 6 hours", ms: 6 * 3600000 },
  { label: "Every 12 hours", ms: 12 * 3600000 },
  { label: "Every 24 hours", ms: 24 * 3600000 },
];

const CRON_PRESETS = [
  { label: "Every day at 9am", expr: "0 9 * * *" },
  { label: "Every weekday at 9am", expr: "0 9 * * 1-5" },
  { label: "Every Monday at 9am", expr: "0 9 * * 1" },
  { label: "Every hour", expr: "0 * * * *" },
  { label: "Every 6 hours", expr: "0 */6 * * *" },
];

function formatSchedule(schedule: any): string {
  if (!schedule) return "Unknown";
  if (schedule.kind === "at") {
    try { return `Once at ${new Date(schedule.at).toLocaleString()}`; } catch { return `Once at ${schedule.at}`; }
  }
  if (schedule.kind === "every") {
    const ms = schedule.everyMs;
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`;
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`;
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`;
    return `Every ${Math.round(ms / 1000)}s`;
  }
  if (schedule.kind === "cron") return schedule.expr || "Cron";
  return JSON.stringify(schedule);
}

// Relay hook — connects to desktop gateway via Railway WebSocket and exposes cron RPC
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
            // RPC responses
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

export default function TasksPage() {
  const relay = useGatewayRelay();
  const [tab, setTab] = useState<TabKey>("scheduled");
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [completedRuns, setCompletedRuns] = useState<CompletedRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<CompletedRun | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // New task form
  const [taskName, setTaskName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("every");
  const [atDate, setAtDate] = useState("");
  const [atTime, setAtTime] = useState("");
  const [everyMs, setEveryMs] = useState(3600000);
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [cronTz, setCronTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [sessionTarget, setSessionTarget] = useState<"main" | "isolated">("isolated");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 4000); };

  const scheduledJobs = jobs.filter((j) => !j.runningAtMs);
  const activeJobs = jobs.filter((j) => j.runningAtMs);

  // Load cron jobs
  const loadJobs = useCallback(async () => {
    if (!relay.deviceOnline) return;
    setLoading(true);
    try {
      const result = await relay.rpc("cron.list", { includeDisabled: true });
      const list: CronJob[] = (result?.jobs || result || []).map((j: any) => ({
        jobId: j.jobId || j.id,
        name: j.name,
        schedule: j.schedule,
        payload: j.payload,
        sessionTarget: j.sessionTarget,
        enabled: j.enabled !== false,
        nextRunAtMs: j.state?.nextRunAtMs,
        runningAtMs: j.state?.runningAtMs,
        lastRunAtMs: j.state?.lastRunAtMs,
        lastStatus: j.state?.lastStatus,
        lastDurationMs: j.state?.lastDurationMs,
      }));
      setJobs(list);

      // Load completed runs
      const allRuns: CompletedRun[] = [];
      for (const job of list.slice(0, 10)) {
        try {
          const r = await relay.rpc("cron.runs", { jobId: job.jobId, limit: 5 });
          for (const entry of r?.entries || []) {
            allRuns.push({
              id: `${job.jobId}-${entry.startedAt || entry.runAtMs || Math.random()}`,
              jobId: job.jobId,
              jobName: job.name || (job.payload?.message || job.payload?.text || "").slice(0, 50),
              startedAt: entry.startedAt || (entry.runAtMs ? new Date(entry.runAtMs).toISOString() : undefined),
              finishedAt: entry.finishedAt || (entry.endedAtMs ? new Date(entry.endedAtMs).toISOString() : undefined),
              status: entry.status === "error" ? "error" : entry.status === "skipped" ? "skipped" : "ok",
              summary: entry.summary || entry.error || undefined,
            });
          }
        } catch {}
      }
      allRuns.sort((a, b) => new Date(b.finishedAt || b.startedAt || 0).getTime() - new Date(a.finishedAt || a.startedAt || 0).getTime());
      setCompletedRuns(allRuns.slice(0, 20));
    } catch (e: any) {
      console.warn("[Tasks] Load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [relay.deviceOnline, relay.rpc]);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { if (!relay.deviceOnline) return; const iv = setInterval(loadJobs, 5000); return () => clearInterval(iv); }, [relay.deviceOnline, loadJobs]);

  const handleDelete = async (jobId: string) => {
    try { await relay.rpc("cron.remove", { jobId }); setJobs((p) => p.filter((j) => j.jobId !== jobId)); flash("Task deleted"); } catch (e: any) { flash(`Error: ${e.message}`); }
  };
  const handleToggle = async (jobId: string, enabled: boolean) => {
    try { await relay.rpc("cron.update", { jobId, patch: { enabled } }); setJobs((p) => p.map((j) => j.jobId === jobId ? { ...j, enabled } : j)); flash(enabled ? "Task enabled" : "Task paused"); } catch (e: any) { flash(`Error: ${e.message}`); }
  };
  const handleRun = async (jobId: string) => {
    try { await relay.rpc("cron.run", { jobId }); flash("Task triggered"); } catch (e: any) { flash(`Error: ${e.message}`); }
  };

  const handleCreateTask = async () => {
    if (!message.trim()) { setFormError("Message is required"); return; }
    setSaving(true); setFormError(null);

    let schedule: any;
    if (scheduleKind === "at") {
      if (!atDate || !atTime) { setFormError("Date and time required"); setSaving(false); return; }
      schedule = { kind: "at", at: new Date(`${atDate}T${atTime}`).toISOString() };
    } else if (scheduleKind === "every") {
      schedule = { kind: "every", everyMs };
    } else {
      if (!cronExpr.trim()) { setFormError("Cron expression required"); setSaving(false); return; }
      schedule = { kind: "cron", expr: cronExpr.trim(), tz: cronTz };
    }

    const payload = sessionTarget === "main"
      ? { kind: "systemEvent", text: message.trim() }
      : { kind: "agentTurn", message: message.trim() };

    try {
      await relay.rpc("cron.add", {
        job: { name: taskName.trim() || undefined, schedule, payload, sessionTarget, enabled: true },
      });
      setShowNewTask(false);
      setTaskName(""); setMessage("");
      loadJobs();
      flash("Task created");
    } catch (e: any) {
      setFormError(e.message || "Failed to create task");
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: "10px",
    border: "1px solid var(--border)", background: "transparent",
    color: "var(--text-primary)", fontSize: "13px", outline: "none", boxSizing: "border-box",
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, cursor: "pointer",
    border: active ? "1px solid var(--accent, #EF4444)" : "1px solid var(--border)",
    background: active ? "rgba(239,68,68,0.08)" : "transparent",
    color: active ? "var(--accent, #EF4444)" : "var(--text-muted)",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ padding: "40px", maxWidth: "960px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText size={20} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Tasks</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {actionMsg && (
            <span style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "8px", background: "var(--card-bg, rgba(255,255,255,0.02))", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              {actionMsg}
            </span>
          )}
          <button onClick={() => setShowNewTask(true)} className="auth-btn" style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px",
            borderRadius: "10px", border: "none", background: "#EF4444", color: "#fff",
            fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={14} /> New Task
          </button>
        </div>
      </div>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>
        Schedule automated tasks on your desktop assistant.
      </p>

      {/* Device status */}
      <div style={{
        padding: "10px 16px", borderRadius: "10px", marginBottom: "20px",
        background: relay.deviceOnline ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
        border: `1px solid ${relay.deviceOnline ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
        display: "flex", alignItems: "center", gap: "8px",
      }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: relay.deviceOnline ? "#22C55E" : "#EF4444" }} />
        <span style={{ fontSize: "12px", color: relay.deviceOnline ? "#22C55E" : "#EF4444" }}>
          Desktop {relay.deviceOnline ? "connected" : "offline"}{!relay.deviceOnline && " — connect your desktop app to manage tasks"}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={loadJobs} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-muted)" }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {([
          { key: "scheduled" as TabKey, label: "Scheduled", icon: Clock, count: scheduledJobs.length },
          { key: "active" as TabKey, label: "Active", icon: Play, count: activeJobs.length },
          { key: "completed" as TabKey, label: "Completed", icon: CheckCircle2, count: completedRuns.length },
        ]).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="auth-btn" style={{
              display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px",
              borderRadius: "10px", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              border: active ? "1px solid var(--accent, #EF4444)" : "1px solid var(--border)",
              background: active ? "rgba(239,68,68,0.06)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}>
              <Icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "6px",
                  background: active ? "var(--accent, #EF4444)" : "var(--border)",
                  color: active ? "#fff" : "var(--text-muted)",
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* New Task Form */}
      {showNewTask && (
        <div style={{
          padding: "24px", borderRadius: "16px", border: "1px solid var(--border)",
          background: "var(--card-bg, rgba(255,255,255,0.02))", marginBottom: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>New Scheduled Task</span>
            <button onClick={() => { setShowNewTask(false); setFormError(null); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Task name */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Task Name (optional)</label>
            <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="e.g. Morning briefing, Check emails..." className="auth-input" style={inputStyle} />
          </div>

          {/* Schedule type */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Schedule</label>
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              {([
                { key: "at" as ScheduleKind, label: "One-time", icon: Calendar },
                { key: "every" as ScheduleKind, label: "Interval", icon: Repeat },
                { key: "cron" as ScheduleKind, label: "Cron", icon: Timer },
              ]).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button key={opt.key} onClick={() => setScheduleKind(opt.key)} style={pillBtn(scheduleKind === opt.key)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon size={12} /> {opt.label}</span>
                  </button>
                );
              })}
            </div>

            {scheduleKind === "at" && (
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="date" value={atDate} onChange={(e) => setAtDate(e.target.value)} className="auth-input" style={{ ...inputStyle, flex: 1 }} />
                <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} className="auth-input" style={{ ...inputStyle, flex: 1 }} />
              </div>
            )}

            {scheduleKind === "every" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {INTERVAL_PRESETS.map((p) => (
                  <button key={p.ms} onClick={() => setEveryMs(p.ms)} style={pillBtn(everyMs === p.ms)}>{p.label}</button>
                ))}
              </div>
            )}

            {scheduleKind === "cron" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "4px" }}>
                  {CRON_PRESETS.map((p) => (
                    <button key={p.expr} onClick={() => setCronExpr(p.expr)} style={pillBtn(cronExpr === p.expr)}>{p.label}</button>
                  ))}
                </div>
                <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="0 9 * * *" className="auth-input" style={{ ...inputStyle, fontFamily: "monospace" }} />
                <input value={cronTz} onChange={(e) => setCronTz(e.target.value)} placeholder="Timezone (e.g. Europe/London)" className="auth-input" style={inputStyle} />
              </div>
            )}
          </div>

          {/* Session target */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Run In</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {([
                { key: "isolated" as const, label: "Background", desc: "Agent runs independently", icon: Bot },
                { key: "main" as const, label: "Main Session", desc: "Injects into your chat", icon: MessageSquare },
              ]).map((opt) => {
                const Icon = opt.icon;
                const active = sessionTarget === opt.key;
                return (
                  <button key={opt.key} onClick={() => setSessionTarget(opt.key)} className="auth-btn" style={{
                    flex: 1, padding: "12px 14px", borderRadius: "12px", textAlign: "left", cursor: "pointer",
                    border: active ? "1px solid var(--accent, #EF4444)" : "1px solid var(--border)",
                    background: active ? "rgba(239,68,68,0.06)" : "transparent",
                    display: "flex", alignItems: "center", gap: "10px",
                    transition: "all 0.15s ease",
                  }}>
                    <Icon size={16} style={{ color: active ? "var(--accent, #EF4444)" : "var(--text-muted)", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>{opt.label}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              {sessionTarget === "main" ? "System Event Text" : "Agent Prompt"}
            </label>
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
              placeholder={sessionTarget === "main" ? "e.g. Reminder: check your emails" : "e.g. Check my inbox and summarize any urgent emails"}
              className="auth-input"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", minHeight: "80px" }}
            />
          </div>

          {formError && <p style={{ fontSize: "12px", color: "#EF4444", marginBottom: "12px" }}>{formError}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button onClick={() => setShowNewTask(false)} style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleCreateTask} disabled={saving || !message.trim()} style={{
              padding: "8px 20px", borderRadius: "10px", border: "none",
              background: saving || !message.trim() ? "rgba(239,68,68,0.3)" : "#EF4444",
              color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create Task
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading && jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)", marginBottom: "12px" }} />
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading tasks...</p>
        </div>
      ) : !relay.deviceOnline ? (
        <div style={{
          textAlign: "center", padding: "60px 16px", borderRadius: "16px",
          border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
        }}>
          <Clock size={32} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "12px" }} />
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 4px" }}>Desktop not connected</p>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
            Open the OverClaw app and sign in to manage tasks remotely.
          </p>
        </div>
      ) : (
        <>
          {/* Scheduled tab */}
          {tab === "scheduled" && (
            scheduledJobs.length === 0 ? (
              <EmptyState icon={Clock} title="No scheduled tasks" desc="Create recurring tasks to automate your assistant." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {scheduledJobs.map((job) => (
                  <JobCard key={job.jobId} job={job} onDelete={handleDelete} onToggle={handleToggle} onRun={handleRun} />
                ))}
              </div>
            )
          )}

          {/* Active tab */}
          {tab === "active" && (
            activeJobs.length === 0 ? (
              <EmptyState icon={Play} title="No active tasks" desc="Running tasks will appear here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeJobs.map((job) => (
                  <div key={job.jobId} className="security-card" style={{
                    padding: "16px 20px", borderRadius: "14px",
                    border: "1px solid rgba(59,130,246,0.3)", background: "var(--card-bg, rgba(255,255,255,0.02))",
                    display: "flex", alignItems: "center", gap: "12px",
                  }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: "#3B82F6", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {job.name || (job.payload?.message || job.payload?.text || "Unnamed").slice(0, 60)}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {job.runningAtMs ? `Started ${new Date(job.runningAtMs).toLocaleTimeString()}` : "Running..."} · {job.sessionTarget === "main" ? "Main" : "Background"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Completed tab */}
          {tab === "completed" && (
            completedRuns.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No completed tasks" desc="Finished task runs will appear here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {completedRuns.map((run) => (
                  <div key={run.id} className="security-card" style={{
                    padding: "16px 20px", borderRadius: "14px",
                    border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
                    display: "flex", alignItems: "center", gap: "12px",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}>
                    {run.status === "error" ? (
                      <X size={16} style={{ color: "#EF4444", flexShrink: 0 }} />
                    ) : (
                      <CheckCircle2 size={16} style={{ color: "#22C55E", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {run.jobName || run.jobId}
                      </div>
                      <div style={{ fontSize: "12px", marginTop: "2px" }}>
                        <span style={{ color: run.status === "error" ? "#EF4444" : "#22C55E" }}>
                          {run.status === "error" ? "Error" : run.status === "skipped" ? "Skipped" : "Complete"}
                        </span>
                        {run.finishedAt && (
                          <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>
                            {new Date(run.finishedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {run.summary && (
                      <button onClick={() => setViewingResponse(run)} className="auth-btn" style={{
                        padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border)",
                        background: "transparent", color: "var(--text-muted)", fontSize: "12px",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                      }}>
                        <Eye size={12} /> View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Response viewer modal */}
      {viewingResponse && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setViewingResponse(null)}>
          <div style={{ width: "560px", maxHeight: "70vh", borderRadius: "16px", display: "flex", flexDirection: "column", background: "var(--card-bg, #1a1a1a)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{viewingResponse.jobName || "Task Response"}</span>
                <span style={{
                  fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px",
                  background: viewingResponse.status === "error" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                  color: viewingResponse.status === "error" ? "#EF4444" : "#22C55E",
                }}>{viewingResponse.status === "error" ? "Error" : "Complete"}</span>
              </div>
              <button onClick={() => setViewingResponse(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
              <pre style={{ fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--text-primary)", fontFamily: "inherit", margin: 0 }}>
                {viewingResponse.summary || "No response content available."}
              </pre>
            </div>
            {viewingResponse.finishedAt && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Finished {new Date(viewingResponse.finishedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable components
function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div style={{
      textAlign: "center", padding: "60px 16px", borderRadius: "16px",
      border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
    }}>
      <Icon size={32} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "12px" }} />
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 4px" }}>{title}</p>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>{desc}</p>
    </div>
  );
}

function JobCard({ job, onDelete, onToggle, onRun }: {
  job: CronJob;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (id: string) => void;
}) {
  const scheduleIcon = job.schedule?.kind === "at" ? Calendar : job.schedule?.kind === "cron" ? Timer : Repeat;
  const Icon = scheduleIcon;

  return (
    <div className="security-card" style={{
      padding: "16px 20px", borderRadius: "14px",
      border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
      display: "flex", alignItems: "center", gap: "12px",
      opacity: job.enabled ? 1 : 0.5,
      transition: "border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
    }}>
      <Icon size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          {job.name || (job.payload?.message || job.payload?.text || "Unnamed task").slice(0, 60)}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
          {formatSchedule(job.schedule)} · {job.sessionTarget === "main" ? "Main" : "Background"}
          {job.lastStatus && (
            <span style={{ marginLeft: "8px", color: job.lastStatus === "error" ? "#EF4444" : "#22C55E" }}>
              Last: {job.lastStatus}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        <button onClick={() => onRun(job.jobId)} title="Run now" className="auth-btn" style={{
          padding: "6px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", display: "flex",
        }}>
          <Play size={13} style={{ color: "var(--accent)" }} />
        </button>
        <button onClick={() => onToggle(job.jobId, !job.enabled)} title={job.enabled ? "Pause" : "Enable"} className="auth-btn" style={{
          padding: "6px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", display: "flex",
        }}>
          {job.enabled ? <Pause size={13} style={{ color: "#F59E0B" }} /> : <Play size={13} style={{ color: "#22C55E" }} />}
        </button>
        <button onClick={() => onDelete(job.jobId)} title="Delete" className="auth-btn" style={{
          padding: "6px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", display: "flex",
        }}>
          <Trash2 size={13} style={{ color: "#EF4444" }} />
        </button>
      </div>
    </div>
  );
}
