"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const discoveryOptions = [
  "Twitter / X",
  "Reddit",
  "TikTok / Instagram",
  "YouTube",
  "Friend or colleague",
  "Search engine",
  "AI model",
  "Discord",
  "Other",
];

const useCaseOptions = [
  "Personal assistant",
  "Coding & development",
  "Home automation",
  "Business & productivity",
  "Creative writing",
  "Research",
  "Other",
];

const hardwareOptions = [
  "Mac",
  "Windows PC",
  "Linux desktop",
  "Cloud server (VPS)",
];

import { Suspense } from "react";

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = Number(searchParams.get("step") || 0);
  const [step, setStep] = useState(initialStep);
  const [discovery, setDiscovery] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [hardware, setHardware] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleUseCase = (uc: string) => {
    setUseCases((prev) =>
      prev.includes(uc) ? prev.filter((x) => x !== uc) : [...prev, uc]
    );
  };

  const toggleHardware = (hw: string) => {
    setHardware((prev) =>
      prev.includes(hw) ? prev.filter((x) => x !== hw) : [...prev, hw]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("onboarding_responses").insert({
          user_id: user.id,
          discovery_source: discovery,
          use_cases: useCases,
          nickname: nickname || null,
          hardware: hardware,
        });

        const ref = localStorage.getItem("overclaw_referral_code");
        if (ref) {
          await supabase
            .from("profiles")
            .update({ referred_by: ref.toUpperCase() })
            .eq("id", user.id)
            .is("referred_by", null);
        }

        await supabase.from("profiles").update({ onboarded: true }).eq("id", user.id);
      }
    } catch (err) {
      console.error("Onboarding save failed:", err);
    }
    const platformMap: Record<string, string> = {
      "Mac": "mac",
      "Windows PC": "windows",
      "Linux desktop": "linux",
      "Cloud server (VPS)": "cloud",
    };
    const platform = platformMap[hardware[0]] || "mac";
    router.push(`/setup/${platform}`);
  };

  const canProceed = step === 0 ? discovery !== "" : step === 1 ? useCases.length > 0 : step === 2 ? true : hardware.length > 0;
  const steps = ["How did you find OverClaw?", "What will you use OverClaw for?", "What should we call you?", "Where will you deploy your assistant?"];
  const lastStep = steps.length - 1;

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
          marginBottom: "12px",
        }}>
          {steps[step]}
        </h1>

        <p style={{
          fontSize: "14px",
          color: "var(--text-secondary)",
          textAlign: "center",
          marginBottom: "32px",
        }}>
          {step === 0 && "We'd love to know what brought you here."}
          {step === 1 && "Pick as many as you like."}
          {step === 2 && "Optional — your AI will use this name."}
          {step === 3 && "Pick one — you can add more later."}
        </p>

        {/* Step 0: Discovery */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {discoveryOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setDiscovery(opt)}
                className={`auth-btn ${discovery === opt ? "auth-btn-selected" : ""}`}
                style={{
                  padding: "14px 20px",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor: discovery === opt ? "var(--accent)" : "var(--border)",
                  background: discovery === opt ? "var(--accent)" : "var(--card-bg, rgba(255,255,255,0.02))",
                  color: discovery === opt ? "white" : "var(--text-secondary)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Use cases */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {useCaseOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => toggleUseCase(opt)}
                className={`auth-btn ${useCases.includes(opt) ? "auth-btn-selected" : ""}`}
                style={{
                  padding: "14px 20px",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor: useCases.includes(opt) ? "var(--accent)" : "var(--border)",
                  background: useCases.includes(opt) ? "var(--accent)" : "var(--card-bg, rgba(255,255,255,0.02))",
                  color: useCases.includes(opt) ? "white" : "var(--text-secondary)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Nickname */}
        {step === 2 && (
          <input
            type="text"
            placeholder="e.g. Alex"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
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
        )}

        {/* Step 3: Hardware */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {hardwareOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setHardware([opt])}
                className={`auth-btn ${hardware.includes(opt) ? "auth-btn-selected" : ""}`}
                style={{
                  padding: "14px 20px",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor: hardware.includes(opt) ? "var(--accent)" : "var(--border)",
                  background: hardware.includes(opt) ? "var(--accent)" : "var(--card-bg, rgba(255,255,255,0.02))",
                  color: hardware.includes(opt) ? "white" : "var(--text-secondary)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={() => (step < lastStep ? setStep(step + 1) : handleSubmit())}
          disabled={!canProceed || loading}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "14px",
            borderRadius: "16px",
            border: "none",
            background: canProceed ? "var(--accent)" : "var(--border)",
            color: canProceed ? "white" : "var(--text-muted)",
            fontSize: "16px",
            fontWeight: 600,
            cursor: canProceed && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          {loading ? "Saving..." : step < lastStep ? "Continue" : "Finish"}
          {!loading && <ArrowRight size={18} />}
        </button>

        {/* Back */}
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              display: "block",
              width: "100%",
              marginTop: "16px",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            ← Go back
          </button>
        )}
      </div>
    </div>
  );
}
