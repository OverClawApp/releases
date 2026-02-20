"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { User, Bell, Palette, Shield, Moon, Sun, Monitor, CheckCircle, Camera, Loader2 } from "lucide-react";

type Tab = "profile" | "notifications" | "appearance" | "security";

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: Shield },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div style={{ padding: "40px", maxWidth: "960px", display: "flex", gap: "32px" }}>
      {/* Tab sidebar */}
      <div style={{ width: "180px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`auth-btn ${activeTab === id ? "auth-btn-selected" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid",
              borderColor: activeTab === id ? "var(--accent)" : "transparent",
              background: activeTab === id ? "var(--accent-bg-5)" : "transparent",
              color: activeTab === id ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <Icon size={16} style={{ color: activeTab === id ? "var(--accent)" : "var(--text-muted)" }} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {activeTab === "profile" && <ProfileSettings />}
        {activeTab === "notifications" && <NotificationSettings />}
        {activeTab === "appearance" && <AppearanceSettings />}
        {activeTab === "security" && <SecuritySettings />}
      </div>
    </div>
  );
}

/* ─── Shared ─── */
function SectionCard({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div style={{
      padding: "24px",
      borderRadius: "16px",
      border: `1px solid ${danger ? "var(--accent-bg-30)" : "var(--border)"}`,
      background: "var(--card-bg, rgba(255,255,255,0.02))",
      marginBottom: "20px",
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>{children}</h3>;
}

function InputField({ label, value, onChange, type = "text", placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="auth-input"
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          background: "transparent",
          color: disabled ? "var(--text-muted)" : "var(--text-primary)",
          fontSize: "13px",
          outline: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: "40px",
        height: "22px",
        borderRadius: "11px",
        border: "none",
        background: value ? "var(--accent)" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "white",
        position: "absolute",
        top: "3px",
        left: value ? "21px" : "3px",
        transition: "left 0.2s ease",
      }} />
    </button>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{desc}</div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        padding: "10px 20px",
        borderRadius: "12px",
        border: "none",
        background: "var(--accent)",
        color: "white",
        fontSize: "13px",
        fontWeight: 600,
        cursor: saving ? "not-allowed" : "pointer",
        opacity: saving ? 0.5 : 1,
      }}
    >
      {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
    </button>
  );
}

/* ─── Profile ─── */
function ProfileSettings() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState("");
  const [createdAt, setCreatedAt] = useState("—");
  const [provider, setProvider] = useState("email");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || "");
      setUserId(u.id);
      setProvider(u.app_metadata?.provider || "email");
      setCreatedAt(u.created_at ? new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");
      setDisplayName(u.user_metadata?.display_name || "");
      // Fetch avatar
      supabase.from("profiles").select("avatar_url").eq("id", u.id).single().then(({ data: p }) => {
        if (p?.avatar_url) setAvatarUrl(p.avatar_url);
      });
    });
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      setAvatarUrl(url);
    } catch (err) {
      console.error("Avatar upload failed:", err);
    }
    setUploadingAvatar(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
    await supabase.auth.updateUser({ data: { display_name: displayName } });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const initial = displayName ? displayName.charAt(0).toUpperCase() : email ? email.charAt(0).toUpperCase() : "?";

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Profile</h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>Manage your account details and preferences</p>

      <SectionCard>
        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div style={{ position: "relative" }}>
            {avatarUrl ? (
              <Image src={avatarUrl} alt="" width={64} height={64} style={{ borderRadius: "16px", objectFit: "cover", width: "64px", height: "64px" }} />
            ) : (
              <div style={{
                width: "64px", height: "64px", borderRadius: "16px", background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "24px", fontWeight: 700, color: "white",
              }}>
                {initial}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                position: "absolute", bottom: "-4px", right: "-4px",
                width: "28px", height: "28px", borderRadius: "50%",
                background: "var(--accent)", border: "2px solid var(--card-bg, #0a0a0a)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {uploadingAvatar ? <Loader2 size={12} className="animate-spin" style={{ color: "white" }} /> : <Camera size={12} style={{ color: "white" }} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{displayName || "No name set"}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{email}</div>
          </div>
        </div>

        <InputField label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Your display name" />
        <InputField label="Email Address" value={email} onChange={setEmail} type="email" disabled />
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="auth-input"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "13px",
              outline: "none",
            }}
          >
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="America/New_York">America/New_York (EST)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
            <option value="Europe/Paris">Europe/Paris (CET)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <SaveButton saving={saving} saved={saved} onClick={handleSave} />
      </SectionCard>

      {/* Account info */}
      <SectionCard>
        <SectionTitle>Account Info</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
          {[
            ["User ID", userId ? `${userId.slice(0, 8)}...` : "—"],
            ["Auth provider", provider],
            ["Account created", createdAt],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ color: "var(--text-primary)", fontFamily: label === "User ID" ? "monospace" : "inherit" }}>{val}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Danger zone */}
      <SectionCard danger>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--accent)", marginBottom: "8px" }}>Danger Zone</h3>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>Irreversible actions. Proceed with caution.</p>
        <div style={{ display: "flex", gap: "12px" }}>
          {["Export Data", "Delete Account"].map((label) => (
            <button key={label} className="auth-btn" style={{
              padding: "8px 16px",
              borderRadius: "10px",
              border: "1px solid var(--accent-bg-30)",
              background: "var(--accent-bg-5)",
              color: "var(--accent)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Notifications ─── */
function NotificationSettings() {
  const [desktopNotifs, setDesktopNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [taskComplete, setTaskComplete] = useState(true);
  const [taskError, setTaskError] = useState(true);
  const [lowTokens, setLowTokens] = useState(true);
  const [billingAlerts, setBillingAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); }, 500);
  };

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Notifications</h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>Control how and when you receive alerts</p>

      <SectionCard>
        <SectionTitle>Delivery</SectionTitle>
        <ToggleRow label="Desktop notifications" desc="System notifications on your device" value={desktopNotifs} onChange={setDesktopNotifs} />
        <ToggleRow label="Email notifications" desc="Receive alerts via email" value={emailNotifs} onChange={setEmailNotifs} />
        <ToggleRow label="Sound" desc="Play a sound when notifications arrive" value={soundEnabled} onChange={setSoundEnabled} />
      </SectionCard>

      <SectionCard>
        <SectionTitle>Tasks</SectionTitle>
        <ToggleRow label="Task completed" desc="When a scheduled task finishes successfully" value={taskComplete} onChange={setTaskComplete} />
        <ToggleRow label="Task errors" desc="When a scheduled task fails or times out" value={taskError} onChange={setTaskError} />
      </SectionCard>

      <SectionCard>
        <SectionTitle>Tokens & Billing</SectionTitle>
        <ToggleRow label="Low token balance" desc="Alert when your token balance is running low" value={lowTokens} onChange={setLowTokens} />
        <ToggleRow label="Billing alerts" desc="Payment issues and subscription changes" value={billingAlerts} onChange={setBillingAlerts} />
      </SectionCard>

      <SectionCard>
        <SectionTitle>Digest</SectionTitle>
        <ToggleRow label="Weekly summary" desc="Usage summary and activity report every Monday" value={weeklyDigest} onChange={setWeeklyDigest} />
      </SectionCard>

      <SaveButton saving={saving} saved={saved} onClick={handleSave} />
    </div>
  );
}

/* ─── Appearance ─── */
function applyTheme(t: string) {
  const resolved = t === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : t;
  document.documentElement.setAttribute("data-theme", resolved);
}

function applyAccent(color: string) {
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-hover", color);
}

function AppearanceSettings() {
  const [theme, setThemeState] = useState("dark");
  const [accentColor, setAccentColorState] = useState("#EF4444");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const themes = [
    { id: "dark", label: "Dark", icon: Moon, bg: "#0D1117", card: "#161B22" },
    { id: "light", label: "Light", icon: Sun, bg: "#F6F8FA", card: "#FFFFFF" },
    { id: "midnight", label: "Midnight", icon: Moon, bg: "#000000", card: "#0A0A0A" },
    { id: "system", label: "System", icon: Monitor, bg: "#0D1117", card: "#161B22" },
  ];

  const accents = [
    { color: "#EF4444", label: "Red" },
    { color: "#3B82F6", label: "Blue" },
    { color: "#8B5CF6", label: "Purple" },
    { color: "#22C55E", label: "Green" },
    { color: "#F59E0B", label: "Amber" },
    { color: "#EC4899", label: "Pink" },
    { color: "#06B6D4", label: "Cyan" },
    { color: "#F97316", label: "Orange" },
  ];

  // Load saved preferences on mount
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("overclaw-theme");
      const savedAccent = localStorage.getItem("overclaw-accent");
      if (savedTheme) { setThemeState(savedTheme); applyTheme(savedTheme); }
      if (savedAccent) { setAccentColorState(savedAccent); applyAccent(savedAccent); }
    } catch {}

    // Listen for system theme changes
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => { if (localStorage.getItem("overclaw-theme") === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: string) => {
    setThemeState(t);
    applyTheme(t);
  };

  const setAccentColor = (c: string) => {
    setAccentColorState(c);
    applyAccent(c);
  };

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem("overclaw-theme", theme);
    localStorage.setItem("overclaw-accent", accentColor);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); }, 300);
  };

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Appearance</h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>Customise the look and feel</p>

      <SectionCard>
        <SectionTitle>Theme</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {themes.map(({ id, label, icon: Icon, bg, card }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className="auth-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                padding: "14px 8px",
                borderRadius: "12px",
                border: `2px solid ${theme === id ? "var(--accent)" : "var(--border)"}`,
                background: theme === id ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ width: "48px", height: "32px", borderRadius: "6px", background: bg, border: "1px solid var(--border)", overflow: "hidden" }}>
                <div style={{ width: "32px", height: "6px", borderRadius: "3px", background: card, margin: "6px auto 0" }} />
                <div style={{ width: "24px", height: "4px", borderRadius: "2px", background: card, margin: "4px auto 0", opacity: 0.5 }} />
              </div>
              <span style={{ fontSize: "11px", fontWeight: 500, color: theme === id ? "var(--text-primary)" : "var(--text-secondary)" }}>{label}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionTitle>Accent Colour</SectionTitle>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {accents.map(({ color }) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              title={color}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: color,
                border: accentColor === color ? "3px solid var(--text-primary)" : "3px solid transparent",
                transform: accentColor === color ? "scale(1.15)" : "scale(1)",
                cursor: "pointer",
                transition: "transform 0.15s ease, border 0.15s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
          <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: accentColor }} />
          <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-muted)" }}>{accentColor.toUpperCase()}</span>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={saved} onClick={handleSave} />
    </div>
  );
}

/* ─── Security ─── */
function SecuritySettings() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [sessionTimeout, setSessionTimeout] = useState("24h");

  const getStrength = (pw: string) => {
    if (!pw) return { label: "", color: "transparent", width: "0%" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: "Weak", color: "var(--accent)", width: "20%" };
    if (score <= 2) return { label: "Fair", color: "#F59E0B", width: "40%" };
    if (score <= 3) return { label: "Good", color: "#F59E0B", width: "60%" };
    if (score <= 4) return { label: "Strong", color: "#22C55E", width: "80%" };
    return { label: "Very Strong", color: "#22C55E", width: "100%" };
  };

  const strength = getStrength(newPassword);

  const handlePasswordUpdate = async () => {
    setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Security</h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>Protect your account and manage access</p>

      {/* Account status */}
      <SectionCard>
        <SectionTitle>Account Status</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)" }}>Email verified</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22C55E" }}>
              <CheckCircle size={12} /> Verified
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Change password */}
      <SectionCard>
        <SectionTitle>Change Password</SectionTitle>
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "10px", background: "var(--accent-bg-5)", border: "1px solid var(--accent-bg-30)", color: "var(--accent)", fontSize: "12px", marginBottom: "16px" }}>
            {error}
          </div>
        )}
        <InputField label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Enter new password" />
        {newPassword && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "3px", background: strength.color, width: strength.width, transition: "all 0.3s ease" }} />
            </div>
            <span style={{ fontSize: "10px", color: strength.color, marginTop: "4px", display: "block" }}>{strength.label}</span>
          </div>
        )}
        <InputField label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Confirm new password" />
        {confirmPassword && confirmPassword !== newPassword && (
          <p style={{ fontSize: "11px", color: "var(--accent)", marginBottom: "16px" }}>Passwords do not match</p>
        )}
        <button
          onClick={handlePasswordUpdate}
          disabled={saving || !newPassword || newPassword !== confirmPassword}
          style={{
            padding: "10px 20px",
            borderRadius: "12px",
            border: "none",
            background: "var(--accent)",
            color: "white",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving || !newPassword || newPassword !== confirmPassword ? 0.4 : 1,
          }}
        >
          {saving ? "Updating..." : saved ? "✓ Updated" : "Update Password"}
        </button>
      </SectionCard>

      {/* Sessions */}
      <SectionCard>
        <SectionTitle>Sessions</SectionTitle>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>Session Timeout</label>
          <select
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value)}
            className="auth-input"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "13px",
              outline: "none",
            }}
          >
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>Automatically sign out after this period of inactivity</p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <SaveButton saving={false} saved={false} onClick={() => {}} />
          <button className="auth-btn" style={{
            padding: "10px 16px",
            borderRadius: "12px",
            border: "1px solid var(--accent-bg-30)",
            background: "var(--accent-bg-5)",
            color: "var(--accent)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
          }}>
            Sign Out All Other Sessions
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
