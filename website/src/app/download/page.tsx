"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, Apple, Monitor } from "lucide-react";

type Platform = "mac-arm" | "mac-intel" | "windows" | "linux" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac-arm";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

const platforms = [
  { key: "mac-arm", label: "macOS (Apple Silicon)", filename: "OverClaw-0.0.0-arm64.dmg", url: "https://github.com/OverClawApp/releases/releases/download/v0.1.2/OverClaw-0.0.0-arm64.dmg" },
  { key: "windows", label: "Windows", filename: "OverClaw-Setup-0.0.0-x64.exe", url: "https://github.com/OverClawApp/releases/releases/download/v0.1.2/OverClaw-Setup-0.0.0-x64.exe" },
  { key: "linux", label: "Linux", filename: "OverClaw-0.0.0.AppImage", url: "https://github.com/OverClawApp/releases/releases/download/v0.1.2/OverClaw-0.0.0.AppImage" },
];

export default function DownloadPage() {
  const [detected, setDetected] = useState<Platform>("unknown");

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      background: "var(--bg-primary)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "25%", left: "25%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.2, filter: "blur(48px)", background: "var(--accent)" }} />
        <div style={{ position: "absolute", bottom: "25%", right: "25%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.1, filter: "blur(48px)", background: "#F97316" }} />
      </div>

      <div style={{
        position: "relative",
        zIndex: 10,
        width: "100%",
        maxWidth: "400px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <Link href="/">
            <Image src="/logo.jpg" alt="OverClaw" width={48} height={48} style={{ borderRadius: "12px", margin: "0 auto" }} />
          </Link>
        </div>

        {/* Heading */}
        <h1 style={{
          fontSize: "clamp(1.5rem, 4vw, 1.75rem)",
          fontWeight: 700,
          textAlign: "center",
          marginBottom: "8px",
          color: "var(--text-primary)",
        }}>
          Download OverClaw
        </h1>
        <p style={{
          fontSize: "14px",
          textAlign: "center",
          color: "var(--text-secondary)",
          marginBottom: "40px",
        }}>
          Choose your platform to get started.
        </p>

        {/* Platform buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {platforms.map((p) => {
            const cs = (p as any).comingSoon;
            return (
              <a
                key={p.key}
                href={cs ? undefined : p.url}
                onClick={(e) => {
                  if (p.key === "windows" && !cs) {
                    const ok = window.confirm(
                      "Windows Defender may block this app while our SSL certificate is still processing. Please continue using admin controls."
                    );
                    if (!ok) e.preventDefault();
                  }
                }}
                className="auth-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderRadius: "12px",
                  border: detected === p.key && !cs ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: detected === p.key && !cs ? "rgba(239,68,68,0.08)" : "var(--bg-card)",
                  color: cs ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: "none",
                  cursor: cs ? "default" : "pointer",
                  transition: "all 0.15s",
                  fontSize: "15px",
                  fontWeight: 500,
                  opacity: cs ? 0.6 : 1,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Download size={18} style={{ color: cs ? "var(--text-muted)" : "var(--accent)" }} />
                  {p.label}
                </span>
                {cs ? (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Coming Soon
                  </span>
                ) : detected === p.key ? (
                  <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Detected
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link href="/" style={{ fontSize: "13px", color: "var(--text-muted)", textDecoration: "none" }}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
