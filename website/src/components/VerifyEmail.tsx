"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";

export default function VerifyEmail() {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email;
    if (email) {
      await supabase.auth.resend({ type: "signup", email });
    }
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
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
        padding: "40px",
        borderRadius: "20px",
        border: "1px solid var(--border)",
        background: "var(--card-bg, rgba(255,255,255,0.02))",
        textAlign: "center",
      }}>
        {/* Logo */}
        <Link href="/">
          <Image src="/logo.jpg" alt="OverClaw" width={48} height={48} style={{ borderRadius: "12px", margin: "0 auto 24px" }} />
        </Link>

        {/* Icon */}
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          background: "var(--accent-bg-10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <Mail size={28} style={{ color: "var(--accent)" }} />
        </div>

        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
          Check your email
        </h1>

        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "32px" }}>
          We&apos;ve sent you a verification link. Click it to activate your account, then come back and log in.
        </p>

        {/* Resend button */}
        <button
          onClick={handleResend}
          disabled={resending || resent}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: resent ? "#22c55e" : "var(--text-primary)",
            fontSize: "14px",
            fontWeight: 500,
            cursor: resending || resent ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            marginBottom: "16px",
          }}
        >
          {resent ? "✓ Email resent" : resending ? "Sending..." : "Resend verification email"}
        </button>

        {/* Login link */}
        <Link href="/login" style={{
          display: "block",
          width: "100%",
          padding: "12px",
          borderRadius: "12px",
          border: "none",
          background: "var(--accent)",
          color: "white",
          fontSize: "14px",
          fontWeight: 600,
          textDecoration: "none",
          textAlign: "center",
        }}>
          Go to Login
        </Link>

        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "24px" }}>
          Didn&apos;t receive anything? Check your spam folder.
        </p>
      </div>
    </div>
  );
}
