"use client";

import { Shield, Terminal, Gauge, KeyRound, SlidersHorizontal } from "lucide-react";

const features = [
  {
    icon: Terminal,
    title: "Built-in SSH",
    description: "Secure shell access baked right in. No external tools or manual key management needed.",
  },
  {
    icon: Gauge,
    title: "Rate Limiters",
    description: "Automatic rate limiting on every endpoint. Prevents abuse and keeps your instance stable under load.",
  },
  {
    icon: KeyRound,
    title: "No API Keys Exposed",
    description: "Your tokens stay server-side. Users never see raw API keys — so they can't be leaked or drained.",
  },
  {
    icon: SlidersHorizontal,
    title: "Fully Customisable Access",
    description: "Fine-grained control over tools, commands, and permissions. Lock down exactly what your agent can and can't do.",
  },
];

export default function Security() {
  return (
    <section style={{ padding: "120px 24px 0" }}>
      {/* Section label */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          maxWidth: "500px",
        }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--accent)",
            whiteSpace: "nowrap",
          }}>
            Security
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        textAlign: "center",
        fontSize: "clamp(1.875rem, 4vw, 2.5rem)",
        fontWeight: 700,
        marginBottom: "16px",
      }}>
        Enhanced Security, Built In
      </h2>
      <p style={{
        textAlign: "center",
        fontSize: "1.125rem",
        color: "var(--text-secondary)",
        marginBottom: "64px",
        maxWidth: "550px",
        margin: "0 auto 64px",
      }}>
        Your data stays yours. No shortcuts, no compromises.
      </p>

      {/* Grid */}
      <div className="security-grid" style={{
        display: "grid",
        gap: "24px",
        maxWidth: "900px",
        margin: "0 auto",
      }}>
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <div
              key={i}
              className="security-card"
              style={{
                padding: "32px",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                background: "var(--card-bg, rgba(255,255,255,0.02))",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "var(--accent-bg-10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}>
                <Icon size={20} style={{ color: "var(--accent)" }} />
              </div>
              <h3 style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "8px",
                color: "var(--text-primary)",
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}>
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
