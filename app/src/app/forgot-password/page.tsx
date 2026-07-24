"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"form" | "submitting" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 429) {
        // The API is anti-enumeration and almost always returns 200. A
        // 429 (too many requests) is the one error we surface verbatim.
        setError("Please try again in a moment.");
        setPhase("form");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
        setPhase("form");
        return;
      }
      setPhase("done");
    } catch {
      setError("Network error. Try again.");
      setPhase("form");
    }
  };

  return (
    <main className="min-h-screen bg-friday-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {phase === "done" ? (
          <div className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              Check your inbox
            </p>
            <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
              If that address is registered,
              <br /> a reset link is on its way.
            </h1>
            <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
              The link expires in one hour. If it doesn&apos;t arrive, check your spam
              folder or ask an admin to invite you again.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-[12.5px] text-friday-accent underline underline-offset-4 hover:no-underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 space-y-5"
          >
            <header>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
                Password reset
              </p>
              <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
                Forgot your password?
              </h1>
              <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
                Enter your account email and we&apos;ll send a single-use link to
                set a new one.
              </p>
            </header>

            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-friday-fg-subtle mb-1.5">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                placeholder="you@dbsarc.com"
                className="w-full h-9 px-3 text-[13px] font-mono bg-friday-bg border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
              />
            </label>

            {error && (
              <p className="text-[12px] text-red-700 dark:text-red-400 leading-snug">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={phase === "submitting" || !email}
              className="w-full h-10 rounded bg-friday-accent text-white text-[13px] font-medium tracking-wide hover:opacity-90 transition-colors duration-100 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {phase === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </button>

            <p className="text-center text-[12px] text-friday-fg-muted">
              <Link
                href="/login"
                className="text-friday-accent underline underline-offset-4 hover:no-underline"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
