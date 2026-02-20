import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t py-12 px-6" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.jpg" alt="OverClaw" width={24} height={24} className="rounded-md" />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            © {new Date().getFullYear()} OverClaw. Built on OpenClaw.
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm transition-colors" style={{ color: "var(--text-muted)" }}>Log in</Link>
          <a href="https://discord.com/invite/clawd" target="_blank" rel="noopener noreferrer"
            className="text-sm transition-colors" style={{ color: "var(--text-muted)" }}>Discord</a>
          <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noopener noreferrer"
            className="text-sm transition-colors" style={{ color: "var(--text-muted)" }}>GitHub</a>
        </div>
      </div>
    </footer>
  );
}
