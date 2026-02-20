"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import { Download, Terminal, Copy, Check, ArrowRight } from "lucide-react";
import { useState } from "react";

interface PlatformInfo {
  title: string;
  icon: string;
  steps: { title: string; description: string; code?: string }[];
  downloadUrl?: string;
  downloadLabel?: string;
  unavailable?: boolean;
}

const platforms: Record<string, PlatformInfo> = {
  mac: {
    title: "Mac",
    icon: "🍎",
    downloadUrl: "/download",
    downloadLabel: "Go to Downloads",
    steps: [
      { title: "Download OverClaw", description: "Click the button above to download the OverClaw app." },
      { title: "Open the file", description: "Open the downloaded .dmg file and drag OverClaw into your Applications folder." },
      { title: "Launch OverClaw", description: "Open OverClaw from Applications. On first launch, right-click → Open to bypass Gatekeeper." },
      { title: "Grant needed permissions", description: "OverClaw will ask for permissions it needs to work — grant them when prompted." },
      { title: "Sign in", description: "Sign in with the account you just created." },
      { title: "Download needed dependencies", description: "OverClaw will automatically download any tools and dependencies it needs." },
      { title: "Press Connect", description: "On the home screen, press Connect to link your assistant to the cloud." },
      { title: "Chat from anywhere in the world", description: "That's it — your assistant is live. Message it from any connected channel, anywhere." },
    ],
  },
  windows: {
    title: "Windows",
    icon: "🪟",
    downloadUrl: "/download",
    downloadLabel: "Go to Downloads",
    steps: [
      { title: "Download OverClaw", description: "Click the button above to download the OverClaw installer." },
      { title: "Open the file", description: "Run the downloaded .exe installer and follow the prompts." },
      { title: "Launch OverClaw", description: "Open OverClaw from the Start Menu or desktop shortcut." },
      { title: "Grant needed permissions", description: "OverClaw will ask for permissions it needs to work — grant them when prompted." },
      { title: "Sign in", description: "Sign in with the account you just created." },
      { title: "Download needed dependencies", description: "OverClaw will automatically download any tools and dependencies it needs." },
      { title: "Press Connect", description: "On the home screen, press Connect to link your assistant to the cloud." },
      { title: "Chat from anywhere in the world", description: "That's it — your assistant is live. Message it from any connected channel, anywhere." },
    ],
  },
  linux: {
    title: "Linux",
    icon: "🐧",
    downloadUrl: "/download",
    downloadLabel: "Go to Downloads",
    steps: [
      { title: "Download OverClaw", description: "Download the OverClaw AppImage or .deb package for your distribution." },
      { title: "Open the file", description: "Run the installer or make the AppImage executable and launch it." },
      { title: "Launch OverClaw", description: "Open OverClaw from your application menu." },
      { title: "Grant needed permissions", description: "OverClaw will ask for permissions it needs to work — grant them when prompted." },
      { title: "Sign in", description: "Sign in with the account you just created." },
      { title: "Download needed dependencies", description: "OverClaw will automatically download any tools and dependencies it needs." },
      { title: "Press Connect", description: "On the home screen, press Connect to link your assistant to the cloud." },
      { title: "Chat from anywhere in the world", description: "That's it — your assistant is live. Message it from any connected channel, anywhere." },
    ],
  },
  cloud: {
    title: "Cloud Server",
    icon: "☁️",
    unavailable: true,
    steps: [],
  },
};

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: "relative",
      marginTop: "12px",
      padding: "14px 16px",
      borderRadius: "12px",
      border: "1px solid var(--border)",
      background: "rgba(0,0,0,0.3)",
      fontFamily: "monospace",
      fontSize: "13px",
      color: "var(--text-secondary)",
      overflowX: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
    }}>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "none",
          border: "none",
          color: copied ? "#22c55e" : "var(--text-muted)",
          cursor: "pointer",
          padding: "4px",
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {code}
    </div>
  );
}

export default function SetupPage({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = use(params);
  const info = platforms[platform] || platforms.mac;

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
        maxWidth: "480px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Link href="/">
            <Image src="/logo.jpg" alt="OverClaw" width={48} height={48} style={{ borderRadius: "12px", margin: "0 auto 24px" }} />
          </Link>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>{info.icon}</div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            Set up on {info.title}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Follow these steps to get your assistant running.
          </p>
        </div>

        {/* Unavailable message */}
        {info.unavailable && (
          <>
            <div style={{
              padding: "24px",
              borderRadius: "16px",
              border: "1px solid var(--accent)",
              background: "var(--accent-bg-5)",
              textAlign: "center",
              marginBottom: "24px",
            }}>
              <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                All cloud servers are currently in use
              </p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                Please select another platform to get started.
              </p>
            </div>
            <Link
              href="/onboarding?step=3"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                padding: "14px",
                borderRadius: "16px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Choose another platform
              <ArrowRight size={16} />
            </Link>
          </>
        )}

        {/* Download button (if applicable) */}
        {info.downloadUrl && (
          <a
            href={info.downloadUrl}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              width: "100%",
              padding: "14px",
              borderRadius: "16px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: "32px",
            }}
          >
            <Download size={18} />
            {info.downloadLabel}
          </a>
        )}

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {info.steps.map((s, i) => (
            <div
              key={i}
              className="auth-btn"
              style={{
                padding: "20px",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                background: "var(--card-bg, rgba(255,255,255,0.02))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "var(--accent-bg-10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--accent)",
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {s.title}
                </h3>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, paddingLeft: "40px" }}>
                {s.description}
              </p>
              {s.code && (
                <div style={{ paddingLeft: "40px" }}>
                  <CodeBlock code={s.code} />
                </div>
              )}
            </div>
          ))}
        </div>

        {!info.unavailable && (
          <>
            {/* Continue to dashboard */}
            <Link
              href="/dashboard"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                marginTop: "32px",
                padding: "14px",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Continue to Dashboard
              <ArrowRight size={16} />
            </Link>

            {/* Different platform link */}
            <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-muted)", marginTop: "16px" }}>
              Wrong platform?{" "}
              <Link href="/onboarding?step=3" style={{ color: "var(--accent)", fontWeight: 500 }}>Choose another</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
