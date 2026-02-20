"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Bot,
  Plus,
  Settings,
  Trash2,
  Play,
  X,
  Loader2,
  RefreshCw,
  User,
  Sparkles,
} from "lucide-react";

const RAILWAY_URL = "https://overclaw-api-production.up.railway.app";
const WORKSPACE = "~/.overclaw/cloud/workspace";
const MAIN_SOUL_PATH = `${WORKSPACE}/SOUL.md`;
const MAIN_AGENTS_PATH = `${WORKSPACE}/AGENTS.md`;
const SUBAGENTS_DIR = `${WORKSPACE}/subagents`;
const REGISTRY_PATH = `${SUBAGENTS_DIR}/registry.json`;
const TEAM_MANIFEST_PATH = `${WORKSPACE}/agents-team.md`;

interface AgentTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  soulContent: string;
  agentsContent?: string;
}

interface SubAgent {
  name: string;
  templateId: string;
  templateName: string;
  status?: "idle" | "running" | "offline";
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    icon: "🎯",
    description: "Manages a team of sub-agents, delegates complex tasks",
    soulContent: `# SOUL.md\n\nYou are the Orchestrator.\nCoordinate multiple specialist sub-agents.\nBreak complex work into clear, parallelizable tasks.\nTrack progress and resolve blockers quickly.\nPrioritize high-impact outcomes over busywork.\nKeep plans concise, practical, and time-bound.\nEscalate risks early and propose mitigation options.\nSynthesize results into one clear final answer.\nPrefer reliable tools, verify before concluding.\nStay calm, focused, and delivery-oriented.`,
    agentsContent: `# AGENTS.md\n\n## Team Strategy\n- Spawn specialists for coding, research, writing, and analysis\n- Delegate tasks with clear scope, constraints, and deliverables\n- Reconcile outputs and return one cohesive result\n`,
  },
  {
    id: "programmer",
    name: "Programmer",
    icon: "💻",
    description: "Expert coder, debugger, and software architect",
    soulContent: `# SOUL.md\n\nYou are a Programmer agent.\nWrite clear, maintainable, production-ready code.\nStart by understanding requirements and edge cases.\nPrefer simple solutions before advanced abstractions.\nAdd meaningful error handling and validation.\nUse tests or verification steps when possible.\nRefactor for readability and performance where needed.\nDocument assumptions and tradeoffs briefly.\nAvoid unnecessary dependencies and risky shortcuts.\nDeliver working code with a concise summary.`,
  },
  {
    id: "artist",
    name: "Artist",
    icon: "🎨",
    description: "Image generation, design, and creative work",
    soulContent: `# SOUL.md\n\nYou are an Artist agent.\nCreate polished visuals and creative concepts.\nClarify style, audience, tone, and objective first.\nOffer multiple directions before finalizing.\nBalance originality with practical usability.\nUse clear visual hierarchy and composition principles.\nExplain design rationale in concise language.\nIterate quickly based on feedback.\nMaintain consistency in brand, color, and typography.\nDeliver assets and prompts ready for use.`,
  },
  {
    id: "researcher",
    name: "Researcher",
    icon: "🔍",
    description: "Deep web research, analysis, and report writing",
    soulContent: `# SOUL.md\n\nYou are a Researcher agent.\nFind accurate, current, and relevant information.\nUse diverse high-quality sources and cross-check claims.\nSeparate facts, assumptions, and open questions.\nSummarize findings with clear structure and citations.\nHighlight risks, uncertainty, and confidence levels.\nPrefer primary sources whenever available.\nAvoid speculation without evidence.\nTranslate complex topics into actionable insights.\nDeliver concise reports optimized for decisions.`,
  },
  {
    id: "writer",
    name: "Writer",
    icon: "✍️",
    description: "Content creation, copywriting, and editing",
    soulContent: `# SOUL.md\n\nYou are a Writer agent.\nCraft clear, engaging, audience-focused content.\nMatch tone and voice to the communication goal.\nPrioritize clarity, flow, and strong structure.\nUse concise language and concrete examples.\nEdit ruthlessly for impact and readability.\nProvide headline and hook variations when useful.\nRespect factual accuracy and source integrity.\nAdapt content for platform-specific formats.\nDeliver polished drafts with optional alternatives.`,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    icon: "📊",
    description: "Data processing, visualization, and analysis",
    soulContent: `# SOUL.md\n\nYou are a Data Analyst agent.\nTurn raw data into reliable insights.\nDefine metrics and success criteria up front.\nClean, validate, and profile data before analysis.\nUse appropriate statistical and visualization methods.\nExplain trends, anomalies, and limitations clearly.\nQuantify uncertainty and confidence where possible.\nFocus on business impact and actionable next steps.\nKeep methods transparent and reproducible.\nDeliver concise findings with clear recommendations.`,
  },
];

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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${RAILWAY_URL}/api/proxy/apikey`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;

        const { apiKey } = await res.json();
        if (!apiKey) return;

        ws = new WebSocket("wss://overclaw-api-production.up.railway.app/ws/web");
        wsRef.current = ws;

        ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", key: apiKey }));
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "relay.connected") {
              setDeviceOnline(!!msg.deviceOnline);
              setConnected(true);
            }
            if (msg.type === "relay.device_online") setDeviceOnline(true);
            if (msg.type === "relay.device_offline") setDeviceOnline(false);
            if (msg.type === "relay.rpc_response" && msg.rpcId) {
              const pending = pendingRef.current.get(msg.rpcId);
              if (!pending) return;
              pendingRef.current.delete(msg.rpcId);
              if (msg.error) pending.reject(new Error(msg.error));
              else pending.resolve(msg.result);
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
    return () => {
      closed = true;
      ws?.close();
    };
  }, []);

  const rpc = useCallback((method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("Not connected"));
      const rpcId = `rpc_${++idCounter.current}_${Date.now()}`;
      pendingRef.current.set(rpcId, { resolve, reject });
      ws.send(JSON.stringify({ type: "relay.rpc_request", rpcId, method, params }));
      setTimeout(() => {
        if (!pendingRef.current.has(rpcId)) return;
        pendingRef.current.delete(rpcId);
        reject(new Error("RPC timeout (15s)"));
      }, 15000);
    });
  }, []);

  return { deviceOnline, connected, rpc };
}

function normalizeExecResult(result: any): string {
  if (typeof result === "string") return result;
  if (!result) return "";
  if (typeof result.stdout === "string") return result.stdout;
  if (typeof result.output === "string") return result.output;
  if (typeof result.result === "string") return result.result;
  if (Array.isArray(result.lines)) return result.lines.join("\n");
  return JSON.stringify(result, null, 2);
}

function shellQuoteSingle(text: string): string {
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

function buildHeredocWrite(path: string, content: string) {
  const marker = `EOF_${Math.random().toString(36).slice(2, 10)}`;
  return `mkdir -p $(dirname ${shellQuoteSingle(path)}) && cat > ${shellQuoteSingle(path)} << '${marker}'\n${content}\n${marker}`;
}

function safeAgentName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
}

export default function BotsPage() {
  const relay = useGatewayRelay();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [mainSoul, setMainSoul] = useState(AGENT_TEMPLATES[0].soulContent);
  const [showMainConfig, setShowMainConfig] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [newName, setNewName] = useState("");
  const [newTemplateId, setNewTemplateId] = useState(AGENT_TEMPLATES[1].id);

  const [editingSubAgent, setEditingSubAgent] = useState<SubAgent | null>(null);
  const [editingSubSoul, setEditingSubSoul] = useState("");

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  };

  const runExec = useCallback(
    async (command: string) => {
      return relay.rpc("exec", { command });
    },
    [relay],
  );

  const readTextFile = useCallback(
    async (path: string) => {
      const result = await runExec(`cat ${shellQuoteSingle(path)} 2>/dev/null || true`);
      return normalizeExecResult(result).trim();
    },
    [runExec],
  );

  const writeTextFile = useCallback(
    async (path: string, content: string) => {
      await runExec(buildHeredocWrite(path, content));
    },
    [runExec],
  );

  const saveRegistry = useCallback(
    async (agents: SubAgent[]) => {
      const body = JSON.stringify({ agents }, null, 2);
      await writeTextFile(REGISTRY_PATH, body);
      const teamMd = `# Agents Team\n\n${agents
        .map((a) => `- ${a.name} (${a.templateName})`)
        .join("\n") || "- No sub-agents configured"}\n`;
      await writeTextFile(TEAM_MANIFEST_PATH, teamMd);
    },
    [writeTextFile],
  );

  const loadData = useCallback(async () => {
    if (!relay.deviceOnline) return;
    setLoading(true);
    try {
      const soul = await readTextFile(MAIN_SOUL_PATH);
      if (soul) setMainSoul(soul);

      let loadedAgents: SubAgent[] = [];
      const registryRaw = await readTextFile(REGISTRY_PATH);
      if (registryRaw) {
        try {
          const parsed = JSON.parse(registryRaw);
          loadedAgents = (parsed?.agents || []).map((a: any) => ({
            name: a.name,
            templateId: a.templateId || "orchestrator",
            templateName: a.templateName || "Orchestrator",
            status: a.status || "idle",
          }));
        } catch {}
      }

      if (loadedAgents.length === 0) {
        const lsResult = await runExec(`ls -1 ${SUBAGENTS_DIR} 2>/dev/null || true`);
        const names = normalizeExecResult(lsResult)
          .split("\n")
          .map((x) => x.trim())
          .filter((x) => x && x !== "registry.json");
        loadedAgents = names.map((name) => ({ name, templateId: "orchestrator", templateName: "Unknown", status: "idle" }));
      }

      setSubAgents(loadedAgents);
    } catch (e: any) {
      flash(`Failed to load bots: ${e?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [readTextFile, relay.deviceOnline, runExec]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const guessMainTemplate = () => {
    const found = AGENT_TEMPLATES.find((t) => mainSoul.toLowerCase().includes(t.name.toLowerCase()));
    return found || null;
  };

  const applyMainTemplate = async (template: AgentTemplate) => {
    setSaving(true);
    try {
      await writeTextFile(MAIN_SOUL_PATH, template.soulContent);
      await writeTextFile(MAIN_AGENTS_PATH, template.agentsContent || "# AGENTS.md\n\nNo additional team instructions yet.\n");
      setMainSoul(template.soulContent);
      setShowTemplatePicker(false);
      flash(`Main agent changed to ${template.name}`);
    } catch (e: any) {
      flash(`Template update failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveMainSoul = async () => {
    setSaving(true);
    try {
      await writeTextFile(MAIN_SOUL_PATH, mainSoul);
      setShowMainConfig(false);
      flash("Main agent configuration saved");
    } catch (e: any) {
      flash(`Save failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const addSubAgent = async () => {
    const cleanName = safeAgentName(newName);
    if (!cleanName) return flash("Enter a valid sub-agent name");
    if (subAgents.some((a) => a.name === cleanName)) return flash("Sub-agent already exists");

    const template = AGENT_TEMPLATES.find((t) => t.id === newTemplateId) || AGENT_TEMPLATES[0];
    const next: SubAgent[] = [...subAgents, { name: cleanName, templateId: template.id, templateName: template.name, status: "idle" }];

    setSaving(true);
    try {
      await runExec(`mkdir -p ${shellQuoteSingle(`${SUBAGENTS_DIR}/${cleanName}`)}`);
      await writeTextFile(`${SUBAGENTS_DIR}/${cleanName}/SOUL.md`, template.soulContent);
      await saveRegistry(next);
      setSubAgents(next);
      setNewName("");
      flash("Sub-agent created");
    } catch (e: any) {
      flash(`Create failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const startSubAgent = async (agent: SubAgent) => {
    try {
      await relay.rpc("sessions_spawn", {
        task: `You are ${agent.name}, a ${agent.templateName} sub-agent. Begin by introducing your role and readiness.`,
        sessionTarget: "isolated",
        name: `subagent:${agent.name}`,
      });
      setSubAgents((prev) => prev.map((a) => (a.name === agent.name ? { ...a, status: "running" } : a)));
      flash(`Started ${agent.name}`);
    } catch (e: any) {
      flash(`Start failed: ${e?.message || "Unknown error"}`);
    }
  };

  const openSubAgentConfig = async (agent: SubAgent) => {
    try {
      const soul = await readTextFile(`${SUBAGENTS_DIR}/${agent.name}/SOUL.md`);
      setEditingSubAgent(agent);
      setEditingSubSoul(soul || "# SOUL.md\n");
    } catch (e: any) {
      flash(`Failed to load SOUL.md: ${e?.message || "Unknown error"}`);
    }
  };

  const saveSubAgentConfig = async () => {
    if (!editingSubAgent) return;
    setSaving(true);
    try {
      await writeTextFile(`${SUBAGENTS_DIR}/${editingSubAgent.name}/SOUL.md`, editingSubSoul);
      setEditingSubAgent(null);
      setEditingSubSoul("");
      flash("Sub-agent configuration saved");
    } catch (e: any) {
      flash(`Save failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteSubAgent = async (agent: SubAgent) => {
    if (!confirm(`Delete sub-agent ${agent.name}?`)) return;
    const next = subAgents.filter((a) => a.name !== agent.name);

    setSaving(true);
    try {
      await runExec(`rm -rf ${shellQuoteSingle(`${SUBAGENTS_DIR}/${agent.name}`)}`);
      await saveRegistry(next);
      setSubAgents(next);
      flash("Sub-agent deleted");
    } catch (e: any) {
      flash(`Delete failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedMainTemplate = guessMainTemplate();

  return (
    <div style={{ padding: "40px", maxWidth: "1000px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bot size={20} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Bots</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {message && (
            <span style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "8px", background: "var(--card-bg, rgba(255,255,255,0.02))", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              {message}
            </span>
          )}
          <button
            onClick={loadData}
            style={{
              padding: "8px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>
        Configure your main agent and manage sub-agents remotely.
      </p>

      <div
        style={{
          padding: "10px 16px",
          borderRadius: "10px",
          marginBottom: "20px",
          background: relay.deviceOnline ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
          border: `1px solid ${relay.deviceOnline ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: relay.deviceOnline ? "#22C55E" : "#EF4444" }} />
        <span style={{ fontSize: "12px", color: relay.deviceOnline ? "#22C55E" : "#EF4444" }}>
          Desktop {relay.deviceOnline ? "connected" : "offline"}
          {!relay.deviceOnline && " — connect your desktop app to manage bots"}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Relay: {relay.connected ? "connected" : "connecting"}</span>
      </div>

      <section style={{ border: "1px solid var(--border)", borderRadius: "14px", background: "var(--card-bg, rgba(255,255,255,0.02))", padding: "20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <User size={16} style={{ color: "var(--text-muted)" }} />
            <h2 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)" }}>Main Agent</h2>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowMainConfig(true)} className="auth-btn" style={smallBtn()}>
              <Settings size={13} /> Configure
            </button>
            <button onClick={() => setShowTemplatePicker(true)} className="auth-btn" style={{ ...smallBtn(), borderColor: "rgba(239,68,68,0.4)", color: "#EF4444" }}>
              <Sparkles size={13} /> Change Template
            </button>
          </div>
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Current role: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{selectedMainTemplate?.name || "Custom"}</span>
        </div>
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: "14px", background: "var(--card-bg, rgba(255,255,255,0.02))", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)" }}>Sub-Agents</h2>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Agent name (e.g. code-helper)"
            className="auth-input"
            style={inputStyle()}
          />
          <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} className="auth-input" style={{ ...inputStyle(), maxWidth: "220px" }}>
            {AGENT_TEMPLATES.map((t) => (
              <option value={t.id} key={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
          <button onClick={addSubAgent} disabled={!relay.deviceOnline || saving} className="auth-btn" style={{ ...primaryBtn(), opacity: !relay.deviceOnline ? 0.5 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            <Loader2 size={16} className="animate-spin" style={{ marginBottom: "8px" }} />
            <div>Loading sub-agents...</div>
          </div>
        ) : subAgents.length === 0 ? (
          <div style={{ padding: "20px", border: "1px dashed var(--border)", borderRadius: "10px", color: "var(--text-muted)", fontSize: "13px" }}>
            No sub-agents yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {subAgents.map((agent) => (
              <div key={agent.name} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <Bot size={15} style={{ color: "var(--text-muted)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{agent.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{agent.templateName}</div>
                </div>
                <span style={{ fontSize: "11px", color: statusColor(agent.status), border: `1px solid ${statusColor(agent.status)}33`, padding: "2px 8px", borderRadius: "999px" }}>
                  {agent.status || "idle"}
                </span>
                <button onClick={() => startSubAgent(agent)} className="auth-btn" style={iconBtn()} title="Start">
                  <Play size={13} style={{ color: "#22C55E" }} />
                </button>
                <button onClick={() => openSubAgentConfig(agent)} className="auth-btn" style={iconBtn()} title="Configure">
                  <Settings size={13} style={{ color: "var(--text-muted)" }} />
                </button>
                <button onClick={() => deleteSubAgent(agent)} className="auth-btn" style={iconBtn()} title="Delete">
                  <Trash2 size={13} style={{ color: "#EF4444" }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showMainConfig && (
        <Modal title="Configure Main Agent" onClose={() => setShowMainConfig(false)}>
          <textarea value={mainSoul} onChange={(e) => setMainSoul(e.target.value)} style={{ ...inputStyle(), minHeight: "260px", resize: "vertical", fontFamily: "monospace" }} />
          <ModalActions onCancel={() => setShowMainConfig(false)} onSave={saveMainSoul} saving={saving} />
        </Modal>
      )}

      {showTemplatePicker && (
        <Modal title="Select Main Agent Template" onClose={() => setShowTemplatePicker(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginBottom: "12px" }}>
            {AGENT_TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => applyMainTemplate(t)} className="auth-btn" style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px", background: "transparent", cursor: "pointer" }}>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{t.icon} {t.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>{t.description}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {editingSubAgent && (
        <Modal title={`Configure ${editingSubAgent.name}`} onClose={() => setEditingSubAgent(null)}>
          <textarea value={editingSubSoul} onChange={(e) => setEditingSubSoul(e.target.value)} style={{ ...inputStyle(), minHeight: "260px", resize: "vertical", fontFamily: "monospace" }} />
          <ModalActions onCancel={() => setEditingSubAgent(null)} onSave={saveSubAgentConfig} saving={saving} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ width: "680px", maxWidth: "92vw", maxHeight: "80vh", overflow: "auto", borderRadius: "14px", background: "var(--card-bg, #1a1a1a)", border: "1px solid var(--border)", padding: "16px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
      <button onClick={onCancel} style={{ ...smallBtn(), border: "none" }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ ...primaryBtn(), opacity: saving ? 0.7 : 1 }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : null}
        Save
      </button>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function smallBtn(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "12px",
    cursor: "pointer",
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "none",
    background: "#EF4444",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  };
}

function iconBtn(): React.CSSProperties {
  return {
    width: "30px",
    height: "30px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

function statusColor(status?: string) {
  if (status === "running") return "#22C55E";
  if (status === "offline") return "#EF4444";
  return "#EAB308";
}
