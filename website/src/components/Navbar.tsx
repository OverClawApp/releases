"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

export default function Navbar() {
  return (
    <div className="absolute top-0 left-0 right-0 z-50" style={{ padding: "16px 20px" }}>
      <div className="flex items-center justify-between">
        <Link href="/" className="text-[15px]" style={{ color: "var(--text-primary)" }}>
          <span className="font-bold">OverClaw</span><span className="font-normal" style={{ color: "var(--text-muted)" }}>.app</span>
        </Link>
        <a href="mailto:support@overclaw.app" className="flex items-center gap-2 text-[14px] transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
          <Mail size={15} />
          Contact Support
        </a>
      </div>
    </div>
  );
}
