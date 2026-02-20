"use client";

import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";

export default function ApiKeysPage() {
  const [keys] = useState([
    { id: "1", name: "Default", key: "oc_sk_...xxxx", created: "2026-02-18" },
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>API Keys</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Manage your OverClaw API keys.</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}>
          <Plus size={16} /> New Key
        </button>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Name</th>
              <th className="text-left px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Key</th>
              <th className="text-left px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Created</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-5 py-4" style={{ color: "var(--text-primary)" }}>{k.name}</td>
                <td className="px-5 py-4 font-mono" style={{ color: "var(--text-secondary)" }}>{k.key}</td>
                <td className="px-5 py-4" style={{ color: "var(--text-muted)" }}>{k.created}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}><Copy size={14} /></button>
                    <button className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
