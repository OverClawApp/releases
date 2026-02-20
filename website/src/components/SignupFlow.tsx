"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

const steps = [
  { key: "name", question: "What's your name?", placeholder: "Your name", type: "text" },
  { key: "email", question: "What's your email?", placeholder: "you@example.com", type: "email" },
  { key: "password", question: "Create a password", placeholder: "At least 8 characters", type: "password" },
];

export default function SignupFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const current = steps[step];
  const currentValue = values[current.key as keyof typeof values];

  const canProceed = () => {
    if (current.key === "name") return currentValue.trim().length >= 1;
    if (current.key === "email") return /\S+@\S+\.\S+/.test(currentValue);
    if (current.key === "password") {
      return currentValue.length >= 8
        && /[A-Z]/.test(currentValue)
        && /[a-z]/.test(currentValue)
        && /[0-9]/.test(currentValue)
        && /[^A-Za-z0-9]/.test(currentValue);
    }
    return false;
  };

  const handleNext = async () => {
    if (!canProceed()) return;

    if (step < steps.length - 1) {
      setStep(step + 1);
      setError("");
      return;
    }

    // Final step — create account
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { display_name: values.name } },
      });
      if (error) throw error;
      router.push("/verify");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleNext();
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

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <Link href="/">
            <Image src="/logo.jpg" alt="OverClaw" width={48} height={48} style={{ borderRadius: "12px", margin: "0 auto" }} />
          </Link>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "48px" }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: i <= step ? "var(--accent)" : "var(--border)",
              transition: "background 0.3s ease",
            }} />
          ))}
        </div>

        {/* Question */}
        <h1 style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "var(--text-primary)",
          textAlign: "center",
          marginBottom: "32px",
          transition: "opacity 0.2s ease",
        }}>
          {current.question}
        </h1>

        {/* Input */}
        <input
          type={current.type}
          placeholder={current.placeholder}
          value={currentValue}
          onChange={(e) => setValues({ ...values, [current.key]: e.target.value })}
          onKeyDown={handleKeyDown}
          autoFocus
          className="auth-input"
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: "16px",
            border: "1px solid var(--border)",
            background: "var(--card-bg, rgba(255,255,255,0.02))",
            color: "var(--text-primary)",
            fontSize: "18px",
            textAlign: "center",
            outline: "none",
            transition: "border-color 0.2s ease",
          }}
        />

        {current.key === "password" && currentValue.length > 0 && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
            {[
              { label: "8+ characters", valid: currentValue.length >= 8 },
              { label: "Uppercase letter", valid: /[A-Z]/.test(currentValue) },
              { label: "Lowercase letter", valid: /[a-z]/.test(currentValue) },
              { label: "Number", valid: /[0-9]/.test(currentValue) },
              { label: "Special character", valid: /[^A-Za-z0-9]/.test(currentValue) },
            ].map((rule) => (
              <span key={rule.label} style={{ fontSize: "12px", color: rule.valid ? "#22c55e" : "var(--text-muted)" }}>
                {rule.valid ? "✓" : "○"} {rule.label}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p style={{ fontSize: "13px", color: "var(--accent)", textAlign: "center", marginTop: "12px" }}>
            {error}
          </p>
        )}

        {/* Continue button */}
        <button
          onClick={handleNext}
          disabled={!canProceed() || loading}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "14px",
            borderRadius: "16px",
            border: "none",
            background: canProceed() ? "var(--accent)" : "var(--border)",
            color: canProceed() ? "white" : "var(--text-muted)",
            fontSize: "16px",
            fontWeight: 600,
            cursor: canProceed() && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          {loading ? "Creating account..." : step < steps.length - 1 ? "Continue" : "Create Account"}
          {!loading && <ArrowRight size={18} />}
        </button>

        {/* Back + Login link */}
        <div style={{ marginTop: "32px", textAlign: "center" }}>
          {step > 0 && (
            <button
              onClick={() => { setStep(step - 1); setError(""); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "13px",
                cursor: "pointer",
                marginBottom: "12px",
                display: "block",
                width: "100%",
              }}
            >
              ← Go back
            </button>
          )}
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Already got an account?{" "}
            <Link href="/login" style={{ color: "var(--accent)", fontWeight: 500 }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
