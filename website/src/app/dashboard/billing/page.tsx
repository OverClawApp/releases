"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Coins, CreditCard, Zap, Crown, Cloud, Check, ArrowRight, Loader2, CheckCircle, Copy, Gift, Link2 } from "lucide-react";


const API_BASE = "https://overclaw-api-production.up.railway.app";

const TOKEN_PACKS = [
  { tokens: 5000, price: 4.99, perToken: "~$1.00/1k", popular: false },
  { tokens: 15000, price: 9.99, perToken: "~$0.67/1k", popular: true },
  { tokens: 50000, price: 24.99, perToken: "~$0.50/1k", popular: false },
  { tokens: 150000, price: 59.99, perToken: "~$0.40/1k", popular: false },
];

const AFFILIATE_MILESTONES = [
  { referrals: 1, rewardTokens: 1000 },
  { referrals: 5, rewardTokens: 5000 },
  { referrals: 10, rewardTokens: 10000 },
  { referrals: 25, rewardTokens: 25000 },
  { referrals: 50, rewardTokens: 50000 },
  { referrals: 100, rewardTokens: 100000 },
  { referrals: 500, rewardTokens: 500000 },
  { referrals: 1000, rewardTokens: 1000000, proForever: true },
];

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro">("free");
  const [tokenBalance, setTokenBalance] = useState(0);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [successScreen, setSuccessScreen] = useState<{ type: "pro" | "tokens"; tokens?: string } | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [affiliateCode, setAffiliateCode] = useState<string>("");
  const [affiliateReferrals, setAffiliateReferrals] = useState<number>(0);
  const [affiliateMilestoneLevel, setAffiliateMilestoneLevel] = useState<number>(0);
  const [claimingAffiliate, setClaimingAffiliate] = useState(false);
  const [origin, setOrigin] = useState("");
  const [affiliateInvites, setAffiliateInvites] = useState<Array<{ invitee_id: string; display_name: string; created_at: string }>>([]);
  const [affiliateCopied, setAffiliateCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Check for payment success return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing === "success") {
      setSuccessScreen({ type: "pro" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (billing === "tokens-success") {
      setSuccessScreen({ type: "tokens", tokens: params.get("tokens") || "" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!successScreen) return;
    if (countdown <= 0) { window.location.reload(); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [successScreen, countdown]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !session.user) { setLoading(false); return; }
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);

        // Ensure user has an affiliate code
        try {
          const { data: code } = await supabase.rpc("ensure_affiliate_code");
          if (code) setAffiliateCode(String(code));

          const { data: myProfile } = await supabase
            .from("profiles")
            .select("referral_code, affiliate_milestone_level")
            .eq("id", session.user.id)
            .single();

          const refCode = myProfile?.referral_code || code;
          if (refCode) {
            setAffiliateCode(refCode);
            const { count } = await supabase
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("referred_by", refCode);
            setAffiliateReferrals(count || 0);

            const { data: invites } = await supabase.rpc("get_affiliate_invites");
            if (Array.isArray(invites)) setAffiliateInvites(invites as any);
          }
          setAffiliateMilestoneLevel(myProfile?.affiliate_milestone_level || 0);
        } catch {}

        const headers = { Authorization: `Bearer ${session.access_token}` };

        // Check subscription
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("user_id", session.user.id)
          .single();
        if (sub?.plan === "pro" && sub?.status === "active") setCurrentPlan("pro");

        // Fetch balance & usage
        const [balRes, usageRes] = await Promise.all([
          fetch(`${API_BASE}/api/proxy/balance`, { headers }),
          fetch(`${API_BASE}/api/proxy/usage`, { headers }),
        ]);
        if (balRes.ok) { const { balance } = await balRes.json(); setTokenBalance(balance || 0); }
        if (usageRes.ok) {
          const { usage } = await usageRes.json();
          if (Array.isArray(usage)) {
            setTotalRequests(usage.length);
            let used = 0;
            for (const log of usage) used += log.tokens_charged || 0;
            setTokensUsed(used);
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSubscribe = async () => {
    if (!userId) return;
    setCheckoutLoading("pro");
    try {
      const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval: "monthly", userId, email: userEmail }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {}
    setCheckoutLoading(null);
  };

  const handleBuyTokens = async (tokens: number, price: number) => {
    if (!userId || currentPlan !== "pro") return;
    setCheckoutLoading(`tokens-${tokens}`);
    try {
      const res = await fetch(`${API_BASE}/api/stripe/checkout-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, price, userId, email: userEmail }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {}
    setCheckoutLoading(null);
  };

  const handleManage = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/api/stripe/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {}
  };

  const handleClaimAffiliate = async () => {
    setClaimingAffiliate(true);
    try {
      const { data } = await supabase.rpc("claim_affiliate_rewards");
      if (data?.tokens_awarded && data.tokens_awarded > 0) {
        setTokenBalance((prev) => prev + Number(data.tokens_awarded));
      }
      if (data?.milestone_level !== undefined) setAffiliateMilestoneLevel(Number(data.milestone_level));
      if (data?.referred_count !== undefined) setAffiliateReferrals(Number(data.referred_count));
      if (data?.unlocked_pro_forever) setCurrentPlan("pro");
      const { data: invites } = await supabase.rpc("get_affiliate_invites");
      if (Array.isArray(invites)) setAffiliateInvites(invites as any);
    } catch {}
    setClaimingAffiliate(false);
  };

  // Success screen
  if (successScreen) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <div style={{
            width: "80px", height: "80px", borderRadius: "50%",
            background: "rgba(34,197,94,0.1)", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
          }}>
            <CheckCircle size={40} style={{ color: "#22c55e" }} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            {successScreen.type === "pro" ? "Welcome to Pro!" : "Tokens Added!"}
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            {successScreen.type === "pro"
              ? "Your Pro subscription is now active. Cloud AI and 2,000 tokens are ready."
              : `${parseInt(successScreen.tokens || "0").toLocaleString()} tokens added to your balance.`}
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>
            Refreshing in {countdown}s...
          </p>
          <div style={{ width: "200px", height: "6px", borderRadius: "3px", background: "var(--border)", margin: "0 auto 16px" }}>
            <div style={{
              height: "100%", borderRadius: "3px", background: "#22c55e",
              width: `${((5 - countdown) / 5) * 100}%`, transition: "width 1s linear",
            }} />
          </div>
          <button onClick={() => window.location.reload()} className="auth-btn" style={{
            padding: "10px 24px", borderRadius: "10px", border: "none",
            background: "#22c55e", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>
            Refresh Now
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Loader2 size={24} className="typing-dot" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 24px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Billing</h1>
        <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>Manage your plan and token balance</p>
      </div>

      {/* Status banner */}
      <div className="security-card" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderRadius: "14px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
        marginBottom: "32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <CreditCard size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
            Current plan: <strong style={{ color: currentPlan === "pro" ? "var(--accent)" : "var(--text-primary)" }}>
              {currentPlan === "pro" ? "Pro" : "Free"}
            </strong>
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            {tokenBalance.toLocaleString()} tokens · {totalRequests} requests
          </span>
        </div>
        {currentPlan === "pro" && (
          <button onClick={handleManage} style={{
            background: "none", border: "none", color: "var(--accent)",
            cursor: "pointer", fontSize: "13px", fontWeight: 500,
          }}>
            Manage subscription →
          </button>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "32px" }}>
        {/* Free */}
        <div className="security-card" style={{
          padding: "28px", borderRadius: "16px",
          border: currentPlan === "free" ? "2px solid var(--accent)" : "1px solid var(--border)",
          background: "var(--card-bg, rgba(255,255,255,0.02))",
          position: "relative",
        }}>
          {currentPlan === "free" && (
            <div style={{
              position: "absolute", top: "-12px", left: "20px",
              background: "var(--accent)", color: "#fff",
              fontSize: "11px", fontWeight: 600, padding: "3px 12px", borderRadius: "20px",
            }}>Current Plan</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(34,197,94,0.1)",
            }}>
              <Zap size={20} style={{ color: "#22c55e" }} />
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Free</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Local AI forever</div>
            </div>
          </div>
          <div style={{ fontSize: "36px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>$0</div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>Free forever</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {["Local AI models (Ollama)", "Unlimited local requests", "All local tools & skills", "Scheduled tasks", "Community support"].map((f) => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
                <Check size={16} style={{ color: "#22c55e", flexShrink: 0 }} /> {f}
              </li>
            ))}
          </ul>
          <button disabled style={{
            width: "100%", marginTop: "24px", padding: "10px", borderRadius: "10px",
            border: "1px solid var(--border)", fontSize: "14px", fontWeight: 600,
            background: "transparent", color: "var(--text-muted)", cursor: "default",
          }}>
            {currentPlan === "free" ? "✓ Current Plan" : "Downgrade"}
          </button>
        </div>

        {/* Pro */}
        <div className="security-card" style={{
          padding: "28px", borderRadius: "16px",
          border: currentPlan === "pro" ? "2px solid var(--accent)" : "1px solid var(--border)",
          background: "var(--card-bg, rgba(255,255,255,0.02))",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: "-12px", left: "20px",
            background: "var(--accent)", color: "#fff",
            fontSize: "11px", fontWeight: 600, padding: "3px 12px", borderRadius: "20px",
          }}>
            {currentPlan === "pro" ? "Current Plan" : "Recommended"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(99,102,241,0.1)",
            }}>
              <Crown size={20} style={{ color: "#6366f1" }} />
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Pro</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Cloud AI included</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
            <span style={{ fontSize: "36px", fontWeight: 700, color: "var(--text-primary)" }}>$24.99</span>
            <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/mo</span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--accent)", marginBottom: "24px" }}>Includes 2,000 free tokens/mo</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {["Everything in Free", "Cloud AI (GPT, Claude, Gemini)", "Smart model routing", "2,000 tokens monthly", "Buy additional tokens", "Priority support"].map((f) => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
                <Check size={16} style={{ color: "#6366f1", flexShrink: 0 }} /> {f}
              </li>
            ))}
          </ul>
          {currentPlan === "pro" ? (
            <button disabled style={{
              width: "100%", marginTop: "24px", padding: "10px", borderRadius: "10px",
              border: "1px solid var(--border)", fontSize: "14px", fontWeight: 600,
              background: "transparent", color: "var(--text-muted)", cursor: "default",
            }}>✓ Current Plan</button>
          ) : (
            <button onClick={handleSubscribe} disabled={!!checkoutLoading} className="auth-btn" style={{
              width: "100%", marginTop: "24px", padding: "10px", borderRadius: "10px",
              border: "none", fontSize: "14px", fontWeight: 600, cursor: "pointer",
              background: "var(--accent)", color: "#fff",
              opacity: checkoutLoading ? 0.7 : 1,
            }}>
              {checkoutLoading === "pro" ? "..." : <>Upgrade to Pro <ArrowRight size={14} style={{ display: "inline", marginLeft: "4px" }} /></>}
            </button>
          )}
        </div>
      </div>

      {/* Token Packs */}
      <div style={{
        padding: "28px", borderRadius: "16px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Coins size={20} style={{ color: "var(--accent)" }} />
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Buy Tokens</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>
          {currentPlan === "pro" ? "Top up your token balance. Tokens never expire." : "Upgrade to Pro to purchase additional tokens."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {TOKEN_PACKS.map((pack) => (
            <div
              key={pack.tokens}
              onClick={() => currentPlan === "pro" && handleBuyTokens(pack.tokens, pack.price)}
              className="security-card"
              style={{
                padding: "20px", borderRadius: "14px", textAlign: "center",
                border: pack.popular ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: "var(--card-bg, rgba(255,255,255,0.02))",
                opacity: currentPlan !== "pro" ? 0.5 : 1,
                cursor: currentPlan === "pro" ? "pointer" : "default",
                position: "relative",
              }}
            >
              {pack.popular && (
                <div style={{
                  position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)",
                  background: "var(--accent)", color: "#fff",
                  fontSize: "10px", fontWeight: 600, padding: "2px 10px", borderRadius: "20px",
                }}>Best Value</div>
              )}
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
                {pack.tokens.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>tokens</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
                ${pack.price}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>{pack.perToken}</div>
              <button disabled={currentPlan !== "pro" || !!checkoutLoading} style={{
                width: "100%", padding: "8px", borderRadius: "8px", border: "none",
                fontSize: "13px", fontWeight: 600,
                background: pack.popular ? "var(--accent)" : "rgba(255,255,255,0.05)",
                color: pack.popular ? "#fff" : "var(--text-secondary)",
                cursor: currentPlan === "pro" ? "pointer" : "default",
              }}>
                {checkoutLoading === `tokens-${pack.tokens}` ? "..." : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Affiliate Rewards */}
      <div style={{
        padding: "28px", borderRadius: "16px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Gift size={20} style={{ color: "var(--accent)" }} />
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Affiliate Rewards</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
          Invite friends and claim milestone rewards. Reach 1,000 referrals and unlock Pro forever.
        </p>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
          padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", marginBottom: "16px",
          background: "rgba(255,255,255,0.01)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <Link2 size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {affiliateCode && origin ? `${origin}/signup?ref=${affiliateCode}` : "Generating affiliate link..."}
            </span>
          </div>
          <button
            onClick={() => {
              if (!affiliateCode) return;
              if (!origin) return;
              navigator.clipboard.writeText(`${origin}/signup?ref=${affiliateCode}`);
              setAffiliateCopied(true);
              setTimeout(() => setAffiliateCopied(false), 1800);
            }}
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}
          >
            <Copy size={13} style={{ display: "inline", marginRight: 6 }} />{affiliateCopied ? "Copied" : "Copy"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Referrals: <strong style={{ color: "var(--text-primary)" }}>{affiliateReferrals}</strong></span>
          <button
            onClick={handleClaimAffiliate}
            disabled={claimingAffiliate}
            style={{ border: "none", background: "var(--accent)", color: "#fff", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "12px", fontWeight: 600, opacity: claimingAffiliate ? 0.7 : 1 }}
          >
            {claimingAffiliate ? "Claiming..." : "Claim rewards"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {AFFILIATE_MILESTONES.map((m, idx) => {
            const reached = affiliateReferrals >= m.referrals;
            const claimed = affiliateMilestoneLevel > idx;
            return (
              <div key={m.referrals} style={{
                padding: "10px", borderRadius: "10px", border: "1px solid var(--border)",
                background: claimed ? "rgba(34,197,94,0.12)" : reached ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.01)",
              }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{m.referrals} refs</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.rewardTokens.toLocaleString()} tokens</div>
                {m.proForever && <div style={{ fontSize: "10px", color: "#6366f1", marginTop: "4px" }}>+ Pro forever</div>}
                <div style={{ fontSize: "10px", marginTop: "4px", color: claimed ? "#22c55e" : reached ? "var(--accent)" : "var(--text-muted)" }}>
                  {claimed ? "Claimed" : reached ? "Ready" : "Locked"}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Invite History</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
            {affiliateInvites.length === 0 ? (
              <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>No referrals yet.</div>
            ) : (
              affiliateInvites.slice(0, 20).map((inv) => (
                <div key={inv.invitee_id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{inv.display_name || "User"}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{new Date(inv.created_at).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* VPS — Coming Soon */}
      <div style={{
        padding: "28px", borderRadius: "16px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
        position: "relative", overflow: "hidden", marginBottom: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Cloud size={20} style={{ color: "#8b5cf6" }} />
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Cloud VPS</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>
          Deploy your own cloud server with OverClaw pre-installed. Always-on AI.
        </p>
        <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {[
              { name: "Starter", spec: "2 vCPU · 4 GB", price: "$12/mo" },
              { name: "Standard", spec: "4 vCPU · 8 GB", price: "$24/mo" },
              { name: "Performance", spec: "8 vCPU · 16 GB", price: "$48/mo" },
            ].map((v) => (
              <div key={v.name} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>{v.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 12px" }}>{v.spec}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{v.price}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.15)", backdropFilter: "blur(1px)", borderRadius: "16px", zIndex: 10,
        }}>
          <span style={{
            fontSize: "16px", fontWeight: 700, color: "#fff",
            background: "#8b5cf6", padding: "10px 28px", borderRadius: "24px",
          }}>Coming Soon</span>
        </div>
      </div>

      {/* Usage Summary */}
      <div style={{
        padding: "28px", borderRadius: "16px",
        border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))",
      }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>Usage Summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[
            { label: "Tokens Used", value: tokensUsed.toLocaleString(), color: "#f59e0b" },
            { label: "Tokens Remaining", value: tokenBalance.toLocaleString(), color: "#22c55e" },
            { label: "Total Requests", value: totalRequests.toLocaleString(), color: "#6366f1" },
          ].map((s) => (
            <div key={s.label} style={{
              padding: "16px", borderRadius: "12px", textAlign: "center",
              border: "1px solid var(--border)", background: "rgba(255,255,255,0.01)",
            }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
