"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, BarChart3, CreditCard, Settings, MessageSquare, LogOut, Menu, PenSquare, Download, FolderOpen, ListTodo, Activity } from "lucide-react";


const allNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview", proOnly: false },
  { href: "/chat", icon: MessageSquare, label: "Chat", proOnly: true },
  { href: "/dashboard/projects", icon: FolderOpen, label: "Projects", proOnly: true },
  { href: "/dashboard/tasks", icon: ListTodo, label: "Tasks", proOnly: true },
  { href: "/dashboard/activity", icon: Activity, label: "Activity", proOnly: true },
  { href: "/dashboard/usage", icon: BarChart3, label: "Usage", proOnly: true },
  { href: "/dashboard/billing", icon: CreditCard, label: "Billing", proOnly: false },
  { href: "/dashboard/settings", icon: Settings, label: "Settings", proOnly: false },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.replace("/login"); return; }
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("user_id", session.user.id)
          .single();
        setIsPro(sub?.plan === "pro" && sub?.status === "active");
      } catch { setIsPro(false); }
    })();
  }, []);

  const navItems = allNavItems.filter((item) => !item.proOnly || isPro);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`} style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: "260px",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        padding: "12px 8px",
        transition: "transform 0.2s ease",
      }}>
        {/* Logo + new chat */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          marginBottom: "8px",
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <Image src="/logo.jpg" alt="OverClaw" width={28} height={28} style={{ borderRadius: "8px" }} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>OverClaw</span>
          </Link>
          <Link href="/chat" style={{ color: "var(--text-muted)", display: "flex", padding: "6px", borderRadius: "8px", transition: "color 0.2s" }}>
            <PenSquare size={18} />
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: active ? "var(--card-bg, rgba(255,255,255,0.05))" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: "14px",
                  fontWeight: active ? 500 : 400,
                  textDecoration: "none",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                <item.icon size={18} style={{ color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <Link href="/download" style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            color: "var(--text-secondary)",
            fontSize: "14px",
            textDecoration: "none",
            transition: "background 0.15s ease",
          }}>
            <Download size={18} style={{ color: "var(--text-muted)" }} />
            Download App
          </Link>
          <button onClick={handleSignOut} style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "none",
            background: "none",
            color: "var(--text-secondary)",
            fontSize: "14px",
            cursor: "pointer",
            width: "100%",
            transition: "background 0.15s ease",
          }}>
            <LogOut size={18} style={{ color: "var(--text-muted)" }} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 35, background: "rgba(0,0,0,0.5)", display: "none" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="dashboard-main" style={{ flex: 1, marginLeft: "260px", display: "flex", flexDirection: "column" }}>
        {/* Mobile header */}
        <div className="mobile-header" style={{
          display: "none",
          height: "56px",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ color: "var(--text-primary)", background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
            <Menu size={24} />
          </button>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", marginLeft: "12px" }}>
            <Image src="/logo.jpg" alt="OverClaw" width={24} height={24} style={{ borderRadius: "6px" }} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>OverClaw</span>
          </Link>
        </div>

        <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
