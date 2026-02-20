"use client";

const rows = [
  {
    items: [
      "📧 Read & summarize email",
      "✏️ Draft replies and follow-ups",
      "🌐 Translate messages in real time",
      "📥 Organize your inbox",
      "🎫 Answer support tickets",
      "📄 Summarize long documents",
      "🔔 Notify before a meeting",
      "📅 Schedule meetings from chat",
    ],
    direction: "left" as const,
  },
  {
    items: [
      "⏰ Remind you of deadlines",
      "📆 Plan your week",
      "📝 Take meeting notes",
      "🌍 Sync across time zones",
      "🧾 Do your taxes",
      "💳 Track expenses and receipts",
      "📊 Compare insurance quotes",
      "🔄 Manage subscriptions",
    ],
    direction: "right" as const,
  },
  {
    items: [
      "💰 Run payroll calculations",
      "💸 Negotiate refunds",
      "🏷️ Find coupons",
      "🔍 Find best prices online",
      "✨ Find discount codes",
      "📉 Price-drop alerts",
      "🔬 Compare product specs",
      "🤝 Negotiate deals",
    ],
    direction: "left" as const,
  },
  {
    items: [
      "📑 Write contracts and NDAs",
      "🕵️ Research competitors",
      "👥 Screen and prioritize leads",
      "🧾 Generate invoices",
      "📊 Create presentations",
      "✈️ Book travel and hotels",
      "🍳 Find recipes from ingredients",
      "📱 Draft social posts",
    ],
    direction: "right" as const,
  },
  {
    items: [
      "📰 Monitor news and alerts",
      "🎯 Set and track goals",
      "📨 Screen cold outreach",
      "📋 Draft job descriptions",
      "🏃 Run standup summaries",
      "📈 Track OKRs and KPIs",
      "🏠 Control smart home devices",
      "💻 Write and debug code",
    ],
    direction: "left" as const,
  },
];

function MarqueeRow({ items, direction }: { items: string[]; direction: "left" | "right" }) {
  // Double the items for seamless loop
  const doubled = [...items, ...items];
  const animClass = direction === "left" ? "animate-marquee-left" : "animate-marquee-right";

  return (
    <div className="relative overflow-hidden marquee-row">
      <div className={`flex gap-3 w-max ${animClass}`}>
        {doubled.map((item, i) => (
          <div
            key={`${item}-${i}`}
            className="whitespace-nowrap shrink-0 marquee-pill"
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              borderRadius: "9999px",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "transparent",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="overflow-hidden" style={{ paddingTop: "144px", paddingBottom: "300px" }}>
      <div style={{ textAlign: "center", marginBottom: "64px" }}>
        <h2 style={{ fontSize: "clamp(1.875rem, 4vw, 2.25rem)", fontWeight: 700, marginBottom: "16px" }}>
          What can OverClaw do for you?
        </h2>
        <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)" }}>
          One assistant, thousands of use cases
        </p>
      </div>

      <div className="space-y-4" style={{ maxWidth: "900px", margin: "0 auto", overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}>
        {rows.map((row, i) => (
          <MarqueeRow key={i} items={row.items} direction={row.direction} />
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: "80px" }}>
        <a href="/download" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 32px",
          borderRadius: "12px",
          fontSize: "15px",
          fontWeight: 600,
          background: "var(--accent)",
          color: "white",
          textDecoration: "none",
          transition: "opacity 0.2s",
        }}>
          Downloads
          <span style={{ display: "inline-flex", transition: "transform 0.2s" }}>→</span>
        </a>
      </div>

      <p style={{ textAlign: "center", marginTop: "32px", fontSize: "13px", color: "var(--text-muted)" }}>
        © {new Date().getFullYear()} OverClaw. Built on{" "}
        <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>
          OpenClaw
        </a>
      </p>
    </section>
  );
}
