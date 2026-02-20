"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Terminal } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--accent)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "#F97316" }} />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div className="relative z-10 flex flex-col items-center" style={{ paddingTop: "clamp(80px, 15vw, 140px)", paddingBottom: "clamp(60px, 10vw, 100px)", maxWidth: "900px", margin: "0 auto", paddingLeft: "20px", paddingRight: "20px" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] text-center" style={{ marginBottom: "46px" }}>
            Your AI.{" "}
            <span className="gradient-text">Your Way.</span>
          </h1>

          <p className="text-lg md:text-xl leading-relaxed text-center"
            style={{ color: "var(--text-secondary)", marginBottom: "40px" }}>
            A desktop AI assistant that runs locally, connects to the cloud, and actually gets things done.<br />
            Multi-model. Privacy-first. Enhanced security and token management. Endlessly extensible.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <Link href="/signup"
              className="group inline-flex items-center gap-3 px-10 py-4.5 rounded-2xl text-lg font-semibold transition-all glow"
              style={{ background: "var(--accent)", color: "white", padding: "18px 40px" }}>
              Get Started
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#features"
              className="inline-flex items-center gap-3 rounded-2xl text-lg font-medium border btn-glow-hover"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "transparent", padding: "18px 40px" }}>
              See Features
            </a>
          </div>
        </motion.div>

        {/* Chat window preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="card glow chat-preview flex flex-col w-full"
          style={{ height: "clamp(380px, 60vw, 520px)", maxWidth: "900px", marginTop: "40px", border: "1px solid var(--border)", overflow: "hidden", padding: "8px" }}
        >
          {/* Header bar */}
          <div className="px-4 py-3.5 flex items-center gap-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent-bg-15)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
            <span className="text-sm font-semibold text-left" style={{ color: "var(--text-primary)" }}>Chat with cloud agent</span>
            <div className="ml-auto">
              <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E" }} />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 16px" }}>
            {/* User message */}
            <div className="flex gap-2.5 justify-end">
              <div className="max-w-[85%]">
                <div className="rounded-lg text-[14px] leading-relaxed"
                  style={{ padding: "10px 18px", background: "var(--accent)", color: "white" }}>
                  Check my calendar and summarise what&apos;s coming up this week
                </div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--accent-bg-15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>

            {/* Assistant message */}
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--accent-bg-15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
              </div>
              <div className="max-w-[85%]">
                <div className="rounded-lg text-[14px] leading-relaxed"
                  style={{ padding: "10px 18px", background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  You&apos;ve got 3 meetings this week. Tuesday 2pm — design review with the team.
                  Wednesday 10am — dentist (don&apos;t forget, you rescheduled twice).
                  Friday 4pm — drinks with Sam. I&apos;d block Thursday for deep work if I were you.
                </div>
              </div>
            </div>

            {/* User message */}
            <div className="flex gap-2.5 justify-end">
              <div className="max-w-[85%]">
                <div className="rounded-lg text-[14px] leading-relaxed"
                  style={{ padding: "10px 18px", background: "var(--accent)", color: "white" }}>
                  Block Thursday, and remind me about the dentist Tuesday evening
                </div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--accent-bg-15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>

            {/* Assistant message */}
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--accent-bg-15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
              </div>
              <div className="max-w-[85%]">
                <div className="rounded-lg text-[14px] leading-relaxed"
                  style={{ padding: "10px 18px", background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  Done. Thursday&apos;s blocked as &quot;Focus Time&quot; and you&apos;ll get a reminder Tuesday at 7pm. 👍
                </div>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="shrink-0 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)", padding: "12px 8px" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <div className="rounded-lg text-[14px]"
              style={{ padding: "10px 18px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-muted)", flex: 1 }}>
              Type a message...
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--accent)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
