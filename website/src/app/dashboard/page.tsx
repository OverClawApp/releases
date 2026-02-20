"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Server, BarChart3, ArrowRight, Send, Crown, Monitor, Wifi, Download, Activity } from "lucide-react";


const suggestions = [
  { icon: FolderOpen, label: "Open Projects", href: "/dashboard/projects" },
  { icon: Server, label: "Create A VPS", href: "#", comingSoon: true },
  { icon: BarChart3, label: "View Usage", href: "/dashboard/usage" },
  { icon: Activity, label: "Agent Activity", href: "/dashboard/activity" },
  { icon: Download, label: "Download App", href: "/download" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setLoading(false); return; }
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("user_id", session.user.id)
          .single();
        setPlan(sub?.plan === "pro" && sub?.status === "active" ? "pro" : "free");
      } catch {
        setPlan("free");
      }
      setLoading(false);
    })();
  }, []);

  const handleChatClick = () => {
    setTransitioning(true);
    setTimeout(() => router.push("/chat"), 400);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="typing-dot" />
      </div>
    );
  }

  // Free plan — gate page
  if (plan === "free") {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "40px 24px", minHeight: "100vh", textAlign: "center",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <Image src="/logo.jpg" alt="OverClaw" width={64} height={64} style={{ borderRadius: "16px", marginBottom: "24px" }} />

        <h1 style={{
          fontSize: "28px", fontWeight: 700, color: "var(--text-primary)",
          marginBottom: "12px", lineHeight: 1.3,
        }}>
          Unlock Cloud Features
        </h1>

        <p style={{
          fontSize: "15px", color: "var(--text-secondary)", maxWidth: "460px",
          lineHeight: 1.6, marginBottom: "40px",
        }}>
          To access cloud features like <strong style={{ color: "var(--text-primary)" }}>Web Relay</strong>,{" "}
          <strong style={{ color: "var(--text-primary)" }}>Cloud AI Models</strong>, and{" "}
          <strong style={{ color: "var(--text-primary)" }}>Projects</strong>, upgrade to Pro.
        </p>

        {/* Feature cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px",
          maxWidth: "520px", width: "100%", marginBottom: "40px",
        }}>
          {[
            { icon: Wifi, label: "Web Relay", desc: "Chat from any browser" },
            { icon: Crown, label: "Cloud AI", desc: "GPT, Claude, Gemini" },
            { icon: Server, label: "Cloud VPS", desc: "Always-on servers", comingSoon: true },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} style={{
                padding: "20px 16px", borderRadius: "14px", textAlign: "center",
                border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
              }}>
                <Icon size={24} style={{ color: "var(--accent)", marginBottom: "8px" }} />
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px", position: "relative", display: "inline-block" }}>
                  {f.label}
                  {f.comingSoon && (
                    <span style={{
                      position: "absolute", top: "-10px", right: "-30px",
                      background: "var(--accent, #EF4444)", color: "#fff",
                      fontSize: "7px", fontWeight: 700, padding: "2px 4px",
                      borderRadius: "5px", lineHeight: 1, textTransform: "uppercase",
                      letterSpacing: "0.5px", whiteSpace: "nowrap",
                    }}>Soon</span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{f.desc}</div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <Link href="/dashboard/billing" className="auth-btn" style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "14px 32px", borderRadius: "14px", border: "none",
          background: "var(--accent)", color: "#fff",
          fontSize: "15px", fontWeight: 600, textDecoration: "none",
          transition: "box-shadow 0.2s ease",
        }}>
          <Crown size={16} />
          Upgrade to Pro — $24.99/mo
          <ArrowRight size={16} />
        </Link>

        {/* Free tier note */}
        <div style={{
          marginTop: "32px", padding: "20px 24px", borderRadius: "14px",
          border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
          maxWidth: "460px", width: "100%",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <Monitor size={18} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Want to try OverClaw for free?</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
            Download the desktop app and use <strong style={{ color: "var(--text-secondary)" }}>Local mode</strong> — run AI models
            privately on your machine with Ollama. No account or payment needed.
          </p>
          <Link href="/download" style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            marginTop: "12px", fontSize: "13px", fontWeight: 500, color: "var(--accent)",
            textDecoration: "none",
          }}>
            <Download size={14} />
            Download Desktop App
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  // Pro plan — full dashboard
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "40px 24px", minHeight: "100vh",
        position: "relative", overflow: "hidden",
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? "scale(0.97) translateY(-10px)" : "scale(1) translateY(0)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* Background gradient orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "25%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.15, filter: "blur(80px)", background: "var(--accent, #EF4444)" }} />
        <div style={{ position: "absolute", bottom: "25%", right: "20%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.08, filter: "blur(80px)", background: "#F97316" }} />
      </div>
      {/* Grid overlay */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none", backgroundImage: "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <h1 style={{
        fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 700,
        color: "var(--text-primary)", marginBottom: "48px", textAlign: "center",
        position: "relative", zIndex: 1,
      }}>
        What would you like to do?
      </h1>

      <div style={{ width: "100%", maxWidth: "640px", marginBottom: "32px", position: "relative", zIndex: 1 }}>
        <div
          onClick={handleChatClick}
          className="auth-input"
          style={{
            padding: "18px 24px", borderRadius: "20px",
            border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
            color: "var(--text-muted)", fontSize: "15px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>Message your assistant...</span>
          <Send size={16} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px", maxWidth: "640px", position: "relative", zIndex: 1 }}>
        {suggestions.map((s) => {
          const Icon = s.icon;
          const Tag = s.comingSoon ? "div" : Link;
          const tagProps = s.comingSoon ? {} : { href: s.href };
          return (
            <Tag
              key={s.label}
              {...(tagProps as any)}
              className="auth-btn"
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 18px", borderRadius: "14px",
                border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
                color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500,
                textDecoration: "none", transition: "border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease",
                cursor: s.comingSoon ? "default" : "pointer",
                opacity: s.comingSoon ? 0.6 : 1,
              }}
            >
              <Icon size={15} style={{ color: "var(--text-muted)" }} />
              <span style={{ position: "relative" }}>
                {s.label}
                {s.comingSoon && (
                  <span style={{
                    position: "absolute", top: "-10px", right: "-38px",
                    background: "var(--accent, #EF4444)", color: "#fff",
                    fontSize: "8px", fontWeight: 700, padding: "2px 5px",
                    borderRadius: "6px", lineHeight: 1, textTransform: "uppercase",
                    letterSpacing: "0.5px", whiteSpace: "nowrap",
                  }}>Soon</span>
                )}
              </span>
              <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
