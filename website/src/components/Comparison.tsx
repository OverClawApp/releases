"use client";

const traditionalSteps = [
  { task: "Find and compare AI providers", time: "30 min" },
  { task: "Set up API keys and billing", time: "15 min" },
  { task: "Install and configure CLI tools", time: "20 min" },
  { task: "Connect messaging channels", time: "20 min" },
  { task: "Set up file access and tools", time: "15 min" },
  { task: "Configure memory and context", time: "20 min" },
  { task: "Build automation workflows", time: "30 min" },
  { task: "Maintain and update everything", time: "Ongoing" },
];

export default function Comparison() {
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
            Comparison
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        textAlign: "center",
        fontSize: "clamp(1.875rem, 4vw, 2.5rem)",
        fontWeight: 700,
        marginBottom: "64px",
      }}>
        Traditional Method vs OverClaw
      </h2>

      {/* Two columns */}
      <div className="comparison-grid" style={{
        display: "grid",
        gap: "24px",
        maxWidth: "900px",
        margin: "0 auto",
      }}>
        {/* Left — Traditional */}
        <div style={{ padding: "0 16px" }}>
          <p style={{ fontStyle: "italic", color: "var(--text-secondary)", marginBottom: "24px", fontSize: "15px" }}>
            Traditional
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {traditionalSteps.map((step, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "14px",
                color: "var(--text-secondary)",
              }}>
                <span>{step.task}</span>
                <span style={{ whiteSpace: "nowrap", marginLeft: "16px" }}>{step.time}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--border)", margin: "20px 0" }} />

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}>
            <span>Total</span>
            <span>2.5 hrs+</span>
          </div>

          <p style={{
            marginTop: "16px",
            fontSize: "13px",
            fontStyle: "italic",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}>
            If you&apos;re <span style={{ color: "var(--accent)" }}>non-technical</span>, multiply these{" "}
            <span style={{ color: "var(--accent)" }}>times by 10</span> — you have to learn each step before doing.
          </p>
        </div>

        {/* VS divider — mobile only */}
        <div className="comparison-vs" style={{
          display: "none",
          alignItems: "center",
          gap: "16px",
          padding: "0 16px",
        }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.05em",
          }}>
            VS
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>

        {/* Right — OverClaw */}
        <div style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>
          <p style={{ fontStyle: "italic", color: "var(--text-secondary)", marginBottom: "8px", fontSize: "15px" }}>
            OverClaw
          </p>
          <p style={{
            fontSize: "clamp(2rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "16px",
          }}>
            Download &amp; go
          </p>
          <p style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: "12px",
          }}>
            Install the app and start chatting — everything&apos;s built in.
          </p>
          <p style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}>
            Web search, file access, memory, scheduling, messaging channels, and tools all work out of the box. No API keys, no config files, no terminal required.
          </p>
        </div>
      </div>
    </section>
  );
}
