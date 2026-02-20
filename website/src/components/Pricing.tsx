"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const tiers = [
  {
    name: "Free",
    price: "£0",
    description: "Local-only. Your hardware, your models.",
    features: [
      "Run local models via Ollama",
      "Full tool access",
      "Skills & extensions",
      "Persistent memory",
      "Desktop app",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Cloud",
    price: "Pay as you go",
    description: "Token-based cloud models. No subscriptions.",
    features: [
      "Everything in Free",
      "Auto-routed cloud models",
      "Claude, GPT, Gemini, DeepSeek",
      "1,000 free tokens to start",
      "Web chat access",
      "Multi-device sync",
    ],
    cta: "Get Started",
    highlighted: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple pricing.{" "}
            <span className="gradient-text">No surprises.</span>
          </h2>
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
            Start free. Pay only for cloud usage.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {tiers.map((tier) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className={`card p-8 relative ${tier.highlighted ? "glow" : ""}`}
              style={{
                borderColor: tier.highlighted ? "rgba(239, 68, 68, 0.3)" : undefined,
              }}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}>
                  Popular
                </div>
              )}
              <h3 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{tier.name}</h3>
              <div className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>{tier.price}</div>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>{tier.description}</p>
              <ul className="space-y-3 mb-8">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <Check size={16} style={{ color: "var(--accent)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup"
                className="block text-center py-3 rounded-xl font-medium text-sm transition-all"
                style={{
                  background: tier.highlighted ? "var(--accent)" : "var(--bg-tertiary)",
                  color: tier.highlighted ? "white" : "var(--text-primary)",
                  border: tier.highlighted ? "none" : "1px solid var(--border)",
                }}>
                {tier.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
