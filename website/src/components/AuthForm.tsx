"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

function getSafeAuthRedirect(): string {
  const localOrigin = `${window.location.origin}/auth/callback`;
  const envSite = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  // In production-like hostnames, prefer explicit site URL if provided.
  if (!isLocalHost && envSite) {
    try {
      const url = new URL(envSite);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return `${url.origin}/auth/callback`;
      }
    } catch {
      // fall back below
    }
  }

  // Hard guard: never emit localhost redirect when current host is not localhost.
  if (!isLocalHost && (localOrigin.includes("localhost") || localOrigin.includes("127.0.0.1"))) {
    console.warn("[Auth] Guarded against localhost redirect in production host; falling back to overclaw.app");
    return "https://overclaw.app/auth/callback";
  }

  return localOrigin;
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("overclaw_referral_code", ref.toUpperCase());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        const redirectTo = getSafeAuthRedirect();
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        router.push("/onboarding");
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Check if user has completed onboarding
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", data.user.id)
          .single();

        if (!profile?.onboarded) {
          router.push("/onboarding");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getSafeAuthRedirect() },
    });
  };

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
      {/* Background gradient orbs — same as Hero */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "25%", left: "25%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.2, filter: "blur(48px)", background: "var(--accent)" }} />
        <div style={{ position: "absolute", bottom: "25%", right: "25%", width: "384px", height: "384px", borderRadius: "50%", opacity: 0.1, filter: "blur(48px)", background: "#F97316" }} />
      </div>
      <div style={{
        position: "relative",
        zIndex: 10,
        width: "100%",
        maxWidth: "400px",
        padding: "40px",
        borderRadius: "20px",
        border: "1px solid var(--border)",
        background: "var(--card-bg, rgba(255,255,255,0.02))",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Link href="/">
            <Image src="/logo.jpg" alt="OverClaw" width={48} height={48} style={{ borderRadius: "12px", margin: "0 auto 16px" }} />
          </Link>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            {mode === "login" ? "Sign in to OverClaw" : "Get started with OverClaw"}
          </p>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="auth-input"
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
            }}
          />
          {error && <p style={{ fontSize: "13px", color: "var(--accent)" }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "12px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-muted)", marginTop: "24px" }}>
          {mode === "login" ? (
            <>Don&apos;t have an account?{" "}<Link href="/signup" style={{ color: "var(--accent)", fontWeight: 500 }}>Sign up</Link></>
          ) : (
            <>Already have an account?{" "}<Link href="/login" style={{ color: "var(--accent)", fontWeight: 500 }}>Log in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
