"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase JS automatically picks up the auth code/hash from the URL
    // and exchanges it for a session, storing it in localStorage.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    // Fallback: if already signed in (session restored from URL)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    // Timeout fallback
    const timeout = setTimeout(() => {
      router.replace("/login");
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg-primary)",
    }}>
      <div style={{ textAlign: "center" }}>
        <div className="typing-dot" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Signing you in...</p>
      </div>
    </div>
  );
}
