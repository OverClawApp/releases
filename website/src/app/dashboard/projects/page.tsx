"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, FolderOpen, ChevronRight, ChevronDown, Search, Trash2, X,
  Clock, CheckCircle2, Circle, AlertCircle, Loader2, RefreshCw,
  Play, Calendar, Pencil, Check, Pause, Square, Send,
} from "lucide-react";


const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";

type TaskStatus = "pending" | "scheduled" | "in_progress" | "completed" | "failed";
type ProjectStatus = "draft" | "scheduled" | "running" | "paused" | "stopped" | "completed";

interface Task {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  dependencies: number[];
  status: TaskStatus;
  expandedDesc?: boolean;
}

interface Project {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  status: ProjectStatus;
  createdAt: Date;
}

const taskStatusConfig: Record<TaskStatus, { icon: typeof Circle; color: string; label: string; pulse?: boolean }> = {
  pending: { icon: Circle, color: "var(--text-muted)", label: "Pending" },
  scheduled: { icon: Calendar, color: "#3B82F6", label: "Scheduled" },
  in_progress: { icon: Loader2, color: "#F59E0B", label: "In Progress", pulse: true },
  completed: { icon: CheckCircle2, color: "#22C55E", label: "Completed" },
  failed: { icon: AlertCircle, color: "#EF4444", label: "Failed" },
};

const projectStatusConfig: Record<ProjectStatus, { color: string; label: string; bg: string }> = {
  draft: { color: "var(--text-muted)", label: "Draft", bg: "var(--border)" },
  scheduled: { color: "#3B82F6", label: "Scheduled", bg: "rgba(59,130,246,0.1)" },
  running: { color: "#F59E0B", label: "Running", bg: "rgba(245,158,11,0.1)" },
  paused: { color: "#F59E0B", label: "Paused", bg: "rgba(245,158,11,0.1)" },
  stopped: { color: "#EF4444", label: "Stopped", bg: "rgba(239,68,68,0.1)" },
  completed: { color: "#22C55E", label: "Completed", bg: "rgba(34,197,94,0.1)" },
};

function fmtTime(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// WebSocket relay for sending tasks to desktop
function useRelay() {
  const wsRef = useRef<WebSocket | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        // Get API key
        const res = await fetch(`${RAILWAY_URL}/api/proxy/apikey`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const { apiKey } = await res.json();
        if (!apiKey) return;

        ws = new WebSocket(`wss://overclaw-api-production.up.railway.app/ws/web`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: "auth", key: apiKey }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "relay.connected") setDeviceOnline(!!msg.deviceOnline);
            if (msg.type === "relay.device_online") setDeviceOnline(true);
            if (msg.type === "relay.device_offline") setDeviceOnline(false);
            if (msg.type === "relay.tasks_scheduled") {
              // Desktop confirmed tasks were scheduled
              console.log("[Projects] Tasks scheduled on desktop:", msg);
            }
          } catch {}
        };
        ws.onclose = () => {
          if (!closed) setTimeout(connect, 5000);
        };
      } catch {}
    };

    connect();
    return () => { closed = true; ws?.close(); };
  }, []);

  const sendTasks = (projectName: string, tasks: Task[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({
      type: "relay.schedule_tasks",
      projectName,
      tasks: tasks.map((t, i) => ({
        title: t.title,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
        dependencies: t.dependencies,
        index: i,
      })),
    }));
    return true;
  };

  const sendPause = (projectName: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: "relay.pause_project", projectName }));
    return true;
  };

  const sendStop = (projectName: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: "relay.stop_project", projectName }));
    return true;
  };

  const sendResume = (projectName: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: "relay.resume_project", projectName }));
    return true;
  };

  return { deviceOnline, sendTasks, sendPause, sendStop, sendResume };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showDesktopOfflinePopup, setShowDesktopOfflinePopup] = useState(false);

  const relay = useRelay();

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Edit task
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMins, setEditMins] = useState(0);

  // Add task
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addMins, setAddMins] = useState(10);

  const filtered = projects.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase())
  );

  const updateProject = (updated: Project) => {
    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedProject(updated);
  };

  const planProject = async (name: string, description: string): Promise<Task[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not signed in");

    const res = await fetch(`${RAILWAY_URL}/api/projects/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to plan project");
    }

    const data = await res.json();
    return (data.tasks || []).map((t: any, i: number) => ({
      id: crypto.randomUUID(),
      title: t.title || `Task ${i + 1}`,
      description: t.description || "",
      estimatedMinutes: t.estimatedMinutes || 10,
      dependencies: t.dependencies || [],
      status: "pending" as TaskStatus,
    }));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project: Project = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim(),
      tasks: [],
      status: "draft",
      createdAt: new Date(),
    };
    setProjects([project, ...projects]);
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    setSelectedProject(project);
    setPlanError(null);
    setPlanning(true);

    try {
      const tasks = await planProject(project.name, project.description);
      const updated = { ...project, tasks };
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedProject(updated);
    } catch (err: any) {
      setPlanError(err.message || "Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedProject) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const tasks = await planProject(selectedProject.name, selectedProject.description);
      const updated = { ...selectedProject, tasks, status: "draft" as ProjectStatus };
      updateProject(updated);
    } catch (err: any) {
      setPlanError(err.message || "Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const handleSchedule = () => {
    if (!selectedProject) return;

    if (!relay.deviceOnline) {
      setShowDesktopOfflinePopup(true);
      return;
    }

    setScheduling(true);

    // Send tasks to desktop via relay
    const sent = relay.sendTasks(selectedProject.name, selectedProject.tasks);

    const updated = {
      ...selectedProject,
      status: "scheduled" as ProjectStatus,
      tasks: selectedProject.tasks.map((t) => ({
        ...t,
        status: t.status === "pending" ? "scheduled" as TaskStatus : t.status,
      })),
    };
    updateProject(updated);

    setTimeout(() => setScheduling(false), 1000);
  };

  const handlePause = () => {
    if (!selectedProject) return;
    relay.sendPause(selectedProject.name);
    updateProject({ ...selectedProject, status: "paused" });
  };

  const handleResume = () => {
    if (!selectedProject) return;
    relay.sendResume(selectedProject.name);
    updateProject({ ...selectedProject, status: "running" });
  };

  const handleStop = () => {
    if (!selectedProject) return;
    relay.sendStop(selectedProject.name);
    const updated = {
      ...selectedProject,
      status: "stopped" as ProjectStatus,
      tasks: selectedProject.tasks.map((t) => ({
        ...t,
        status: (t.status === "scheduled" || t.status === "in_progress") ? "pending" as TaskStatus : t.status,
      })),
    };
    updateProject(updated);
  };

  const handleDeleteTask = (taskId: string) => {
    if (!selectedProject) return;
    updateProject({ ...selectedProject, tasks: selectedProject.tasks.filter((t) => t.id !== taskId) });
  };

  const handleAddTask = () => {
    if (!selectedProject || !addTitle.trim()) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: addTitle.trim(),
      description: addDesc.trim(),
      estimatedMinutes: addMins,
      dependencies: [],
      status: selectedProject.status === "scheduled" || selectedProject.status === "running" ? "scheduled" : "pending",
    };
    updateProject({ ...selectedProject, tasks: [...selectedProject.tasks, newTask] });
    setAddTitle(""); setAddDesc(""); setAddMins(10); setShowAddTask(false);
  };

  const handleSaveEdit = (taskId: string) => {
    if (!selectedProject) return;
    updateProject({
      ...selectedProject,
      tasks: selectedProject.tasks.map((t) =>
        t.id === taskId ? { ...t, title: editTitle, description: editDesc, estimatedMinutes: editMins } : t
      ),
    });
    setEditingTask(null);
  };

  const toggleTaskDesc = (taskId: string) => {
    if (!selectedProject) return;
    updateProject({
      ...selectedProject,
      tasks: selectedProject.tasks.map((t) =>
        t.id === taskId ? { ...t, expandedDesc: !t.expandedDesc } : t
      ),
    });
  };

  const handleDelete = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
  };

  const getTimeline = (tasks: Task[]) => {
    const starts: number[] = new Array(tasks.length).fill(0);
    for (let i = 0; i < tasks.length; i++) {
      for (const dep of tasks[i].dependencies) {
        if (dep < tasks.length) starts[i] = Math.max(starts[i], starts[dep] + tasks[dep].estimatedMinutes);
      }
    }
    return starts;
  };

  // ─── Detail View ────────────────────────────────────────────────────────
  if (selectedProject) {
    const completedCount = selectedProject.tasks.filter((t) => t.status === "completed").length;
    const totalTasks = selectedProject.tasks.length;
    const progress = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
    const totalMinutes = selectedProject.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const timeline = getTimeline(selectedProject.tasks);
    const totalDuration = Math.max(...selectedProject.tasks.map((t, i) => timeline[i] + t.estimatedMinutes), 0);
    const ps = projectStatusConfig[selectedProject.status];
    const isActive = selectedProject.status === "scheduled" || selectedProject.status === "running";
    const isPaused = selectedProject.status === "paused";
    const isStopped = selectedProject.status === "stopped";

    return (
      <div style={{ flex: 1, minHeight: "100vh", padding: "40px 24px" }}>
        {showDesktopOfflinePopup && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={() => setShowDesktopOfflinePopup(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 440, borderRadius: 14, border: "1px solid rgba(239,68,68,0.25)", background: "var(--card-bg, #111)", padding: 16 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#FCA5A5", margin: 0 }}>Desktop offline</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0 0" }}>
                Connect your desktop app to manage tasks.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button
                  onClick={() => setShowDesktopOfflinePopup(false)}
                  style={{ borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", padding: "7px 12px", fontSize: 12, cursor: "pointer" }}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {/* Back */}
          <button
            onClick={() => { setSelectedProject(null); setEditingTask(null); setPlanError(null); }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "24px", padding: 0 }}
          >
            ← All Projects
          </button>

          {/* Header */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FolderOpen size={20} style={{ color: "#EF4444" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {selectedProject.name}
                  </h1>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "8px",
                    background: ps.bg, color: ps.color,
                  }}>
                    {ps.label}
                  </span>
                </div>
                {selectedProject.description && (
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "4px 0 0" }}>
                    {selectedProject.description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Device status */}
          <div style={{
            padding: "10px 16px", borderRadius: "10px", marginBottom: "16px",
            background: relay.deviceOnline ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${relay.deviceOnline ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: relay.deviceOnline ? "#22C55E" : "#EF4444",
            }} />
            <span style={{ fontSize: "12px", color: relay.deviceOnline ? "#22C55E" : "#EF4444" }}>
              Desktop {relay.deviceOnline ? "connected" : "offline"} {!relay.deviceOnline && "— tasks will sync when desktop comes online"}
            </span>
          </div>

          {/* Progress bar */}
          {totalTasks > 0 && (
            <div style={{
              padding: "20px", borderRadius: "16px", border: "1px solid var(--border)",
              background: "var(--card-bg, rgba(255,255,255,0.02))", marginBottom: "20px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Progress — {completedCount}/{totalTasks} tasks
                </span>
                <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <span><Clock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />{fmtTime(totalMinutes)} total</span>
                  {totalDuration > 0 && <span>~{fmtTime(totalDuration)} elapsed</span>}
                </div>
              </div>
              <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "var(--border)" }}>
                <div style={{
                  width: `${progress}%`, height: "100%", borderRadius: "3px",
                  background: progress === 100 ? "#22C55E" : "#EF4444",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            {/* Schedule button — show when draft or stopped */}
            {(selectedProject.status === "draft" || isStopped) && totalTasks > 0 && (
              <button onClick={handleSchedule} disabled={scheduling} className="auth-btn" style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
                borderRadius: "12px", border: "none", background: "#EF4444", color: "#fff",
                fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: scheduling ? 0.6 : 1,
              }}>
                {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {scheduling ? "Scheduling..." : "Schedule All Tasks"}
              </button>
            )}

            {/* Pause button — show when scheduled or running */}
            {isActive && (
              <button onClick={handlePause} className="auth-btn" style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
                borderRadius: "12px", border: "1px solid #F59E0B", background: "rgba(245,158,11,0.08)",
                color: "#F59E0B", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}>
                <Pause size={14} /> Pause
              </button>
            )}

            {/* Resume button — show when paused */}
            {isPaused && (
              <button onClick={handleResume} className="auth-btn" style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
                borderRadius: "12px", border: "none", background: "#22C55E", color: "#fff",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}>
                <Play size={14} /> Resume
              </button>
            )}

            {/* Stop button — show when scheduled, running, or paused */}
            {(isActive || isPaused) && (
              <button onClick={handleStop} className="auth-btn" style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
                borderRadius: "12px", border: "1px solid #EF4444", background: "rgba(239,68,68,0.08)",
                color: "#EF4444", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}>
                <Square size={14} /> Stop
              </button>
            )}

            <button onClick={handleRegenerate} disabled={planning} className="auth-btn" style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
              borderRadius: "12px", border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: planning ? "default" : "pointer",
              opacity: planning ? 0.5 : 1,
            }}>
              <RefreshCw size={14} className={planning ? "animate-spin" : ""} /> Regenerate Plan
            </button>

            <button onClick={() => setShowAddTask(true)} className="auth-btn" style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
              borderRadius: "12px", border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            }}>
              <Plus size={14} /> Add Task
            </button>
          </div>

          {/* Status banners */}
          {isActive && (
            <div style={{
              padding: "16px 20px", borderRadius: "12px", marginBottom: "20px",
              background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <Calendar size={16} style={{ color: "#3B82F6" }} />
              <span style={{ fontSize: "13px", color: "#93C5FD" }}>
                Tasks scheduled — estimated completion in <strong>{fmtTime(totalDuration)}</strong>
              </span>
            </div>
          )}

          {isPaused && (
            <div style={{
              padding: "16px 20px", borderRadius: "12px", marginBottom: "20px",
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <Pause size={16} style={{ color: "#F59E0B" }} />
              <span style={{ fontSize: "13px", color: "#FCD34D" }}>
                Project paused — no new tasks will start. Resume to continue.
              </span>
            </div>
          )}

          {isStopped && (
            <div style={{
              padding: "16px 20px", borderRadius: "12px", marginBottom: "20px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <Square size={16} style={{ color: "#EF4444" }} />
              <span style={{ fontSize: "13px", color: "#FCA5A5" }}>
                Project stopped — all pending tasks have been cancelled. You can reschedule or regenerate.
              </span>
            </div>
          )}

          {/* Planning state */}
          {planning && (
            <div style={{
              padding: "48px", borderRadius: "16px", border: "1px solid var(--border)",
              background: "var(--card-bg, rgba(255,255,255,0.02))", textAlign: "center",
            }}>
              <Loader2 size={32} className="animate-spin" style={{ color: "#EF4444", marginBottom: "16px" }} />
              <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
                Planning your project...
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
                Breaking down tasks, estimating timelines, mapping dependencies
              </p>
            </div>
          )}

          {/* Plan error */}
          {planError && !planning && (
            <div style={{
              padding: "20px", borderRadius: "12px", marginBottom: "20px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <AlertCircle size={16} style={{ color: "#EF4444" }} />
              <span style={{ fontSize: "13px", color: "#FCA5A5" }}>{planError}</span>
            </div>
          )}

          {/* Add task form */}
          {showAddTask && (
            <div style={{
              padding: "20px", borderRadius: "16px", border: "1px solid var(--border)",
              background: "var(--card-bg, rgba(255,255,255,0.02))", marginBottom: "16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Add Task</span>
                <button onClick={() => setShowAddTask(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>
                  <X size={16} />
                </button>
              </div>
              <input
                autoFocus value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Task title" className="auth-input"
                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", outline: "none", marginBottom: "10px", boxSizing: "border-box" }}
              />
              <textarea
                value={addDesc} onChange={(e) => setAddDesc(e.target.value)}
                placeholder="Task description..." rows={3}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", outline: "none", marginBottom: "10px", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-muted)" }}>Est. time (min):</label>
                <input
                  type="number" value={addMins} onChange={(e) => setAddMins(Number(e.target.value))} min={1}
                  style={{ width: "70px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "13px", outline: "none" }}
                />
                <div style={{ flex: 1 }} />
                <button onClick={handleAddTask} disabled={!addTitle.trim()} style={{
                  padding: "8px 18px", borderRadius: "10px", border: "none",
                  background: addTitle.trim() ? "#EF4444" : "rgba(239,68,68,0.3)",
                  color: "#fff", fontSize: "13px", fontWeight: 600, cursor: addTitle.trim() ? "pointer" : "default",
                }}>
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Task list */}
          {!planning && selectedProject.tasks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {selectedProject.tasks.map((task, idx) => {
                const sc = taskStatusConfig[task.status];
                const StatusIcon = sc.icon;
                const isEditing = editingTask === task.id;
                const startMin = timeline[idx];

                return (
                  <div key={task.id} className="security-card" style={{
                    borderRadius: "14px", border: "1px solid var(--border)",
                    background: "var(--card-bg, rgba(255,255,255,0.02))",
                    overflow: "hidden", transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}>
                    <div style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ paddingTop: "2px", flexShrink: 0 }}>
                          <StatusIcon size={18} style={{ color: sc.color }} className={sc.pulse ? "animate-spin" : ""} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                                style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, outline: "none" }} />
                              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                                style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>Min:</label>
                                <input type="number" value={editMins} onChange={(e) => setEditMins(Number(e.target.value))} min={1}
                                  style={{ width: "60px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "12px", outline: "none" }} />
                                <button onClick={() => handleSaveEdit(task.id)} style={{ background: "none", border: "none", color: "#22C55E", cursor: "pointer", padding: "4px" }}><Check size={16} /></button>
                                <button onClick={() => setEditingTask(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px" }}><X size={16} /></button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div onClick={() => toggleTaskDesc(task.id)} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                                  {String(idx + 1).padStart(2, "0")}
                                </span>
                                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{task.title}</span>
                                {task.description && (task.expandedDesc ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />)}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${sc.color}18`, color: sc.color, fontWeight: 500 }}>{sc.label}</span>
                                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--border)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={10} /> {fmtTime(task.estimatedMinutes)}
                                </span>
                                {(isActive || isPaused) && (
                                  <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "rgba(59,130,246,0.1)", color: "#93C5FD" }}>
                                    starts at +{fmtTime(startMin)}
                                  </span>
                                )}
                                {task.dependencies.length > 0 && task.dependencies.map((dep) => (
                                  <span key={dep} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "5px", background: "rgba(139,92,246,0.1)", color: "#A78BFA" }}>
                                    needs #{dep + 1}
                                  </span>
                                ))}
                              </div>
                              {task.expandedDesc && task.description && (
                                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "10px 0 0", paddingLeft: "28px" }}>
                                  {task.description}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        {!isEditing && (
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <button
                              onClick={() => { setEditingTask(task.id); setEditTitle(task.title); setEditDesc(task.description); setEditMins(task.estimatedMinutes); }}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "6px" }}
                            ><Pencil size={13} /></button>
                            <button onClick={() => handleDeleteTask(task.id)}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "6px" }}
                            ><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!planning && selectedProject.tasks.length === 0 && !planError && (
            <div style={{
              padding: "48px", borderRadius: "16px", border: "1px solid var(--border)",
              background: "var(--card-bg, rgba(255,255,255,0.02))", textAlign: "center",
            }}>
              <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
                No tasks yet. Click "Regenerate Plan" to auto-generate tasks, or "Add Task" to create manually.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── List View ──────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: "100vh", padding: "40px 24px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Projects</h1>
          <button onClick={() => setShowCreate(true)} className="auth-btn" style={{
            display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px",
            borderRadius: "12px", border: "none", background: "#EF4444", color: "#fff",
            fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={16} /> New Project
          </button>
        </div>

        <div style={{ marginBottom: "24px", position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." className="auth-input"
            style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))", color: "var(--text-primary)", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
        </div>

        {showCreate && (
          <div style={{ border: "1px solid var(--border)", borderRadius: "16px", background: "var(--card-bg, rgba(255,255,255,0.02))", padding: "24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Create Project</h3>
              <button onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}><X size={18} /></button>
            </div>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" className="auth-input"
              onKeyDown={(e) => e.key === "Enter" && newDesc && handleCreate()}
              style={{ width: "100%", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", outline: "none", marginBottom: "12px", boxSizing: "border-box" }} />
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe what you want to build — the more detail, the better the plan..." className="auth-input" rows={4}
              style={{ width: "100%", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", outline: "none", marginBottom: "16px", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={handleCreate} disabled={!newName.trim()} style={{
                padding: "10px 24px", borderRadius: "12px", border: "none",
                background: newName.trim() ? "#EF4444" : "rgba(239,68,68,0.3)",
                color: "#fff", fontSize: "14px", fontWeight: 600, cursor: newName.trim() ? "pointer" : "default",
              }}>Create & Plan</button>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Costs 500 tokens to generate plan</span>
            </div>
          </div>
        )}

        {filtered.length === 0 && !showCreate ? (
          <div style={{ textAlign: "center", padding: "80px 16px", color: "var(--text-muted)" }}>
            <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
            <p style={{ fontSize: "16px", margin: "0 0 8px", color: "var(--text-secondary)" }}>
              {search ? "No projects found" : "No projects yet"}
            </p>
            <p style={{ fontSize: "14px", margin: 0 }}>
              {search ? "Try a different search term." : "Create a project and we'll break it down into tasks automatically."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map((project) => {
              const done = project.tasks.filter((t) => t.status === "completed").length;
              const total = project.tasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const psc = projectStatusConfig[project.status];

              return (
                <div key={project.id} onClick={() => setSelectedProject(project)} className="auth-btn" style={{
                  padding: "16px 20px", borderRadius: "14px", border: "1px solid var(--border)",
                  background: "var(--card-bg, rgba(255,255,255,0.02))", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FolderOpen size={18} style={{ color: "#EF4444" }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{project.name}</span>
                        <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "6px", background: psc.bg, color: psc.color }}>{psc.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        {total > 0 && (
                          <>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{done}/{total} tasks</span>
                            <div style={{ width: "60px", height: "4px", borderRadius: "2px", background: "var(--border)" }}>
                              <div style={{ width: `${pct}%`, height: "100%", borderRadius: "2px", background: pct === 100 ? "#22C55E" : "#EF4444" }} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "6px", display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
