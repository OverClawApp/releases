import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
  title: "OverClaw — Your AI, Your Machine",
  description: "A powerful desktop AI assistant that runs locally and connects to the cloud. Multi-model, privacy-first, endlessly extensible.",
  openGraph: {
    title: "OverClaw — Your AI, Your Machine",
    description: "A powerful desktop AI assistant that runs locally and connects to the cloud.",
    url: "https://overclaw.app",
    siteName: "OverClaw",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OverClaw — Your AI, Your Machine",
    description: "A powerful desktop AI assistant that runs locally and connects to the cloud.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('overclaw-theme') || 'dark';
              var resolved = theme === 'system'
                ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                : theme;
              document.documentElement.setAttribute('data-theme', resolved);
              var accent = localStorage.getItem('overclaw-accent');
              if (accent) document.documentElement.style.setProperty('--accent', accent);
            } catch(e) {}
          })();
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
