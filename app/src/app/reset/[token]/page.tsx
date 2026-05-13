"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<"validating" | "form" | "invalid" | "submitting" | "done">(
    "validating",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setPhase(res.ok ? "form" : "invalid");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPhase("submitting");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't reset password.");
        setPhase("form");
        return;
      }
      setPhase("done");
      setTimeout(() => router.push("/login"), 2_500);
    } catch {
      setError("Network error. Try again.");
      setPhase("form");
    }
  };

  return (
    <main className="min-h-screen bg-friday-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {phase === "validating" && (
          <div className="text-center space-y-3">
            <Loader2 className="h-5 w-5 animate-spin text-friday-fg-muted mx-auto" />
            <p className="font-display italic text-friday-fg-muted">
              Verifying the reset link…
            </p>
          </div>
        )}

        {phase === "invalid" && (
          <div className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              Password reset
            </p>
            <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
              This reset link isn't valid.
            </h1>
            <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
              It may have expired (links live for one hour) or already been
              used. Start a fresh reset below.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block mt-6 text-[12.5px] text-friday-accent underline underline-offset-4 hover:no-underline"
            >
              Request a new link
            </Link>
          </div>
        )}

        {(phase === "form" || phase === "submitting") && (
          <form
            onSubmit={submit}
            className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 space-y-5"
          >
            <header>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
                Password reset
              </p>
              <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
                Choose a new password.
              </h1>
              <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
                At least 10 characters. You'll sign in with the new one
                straight after.
              </p>
            </header>

            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-friday-fg-subtle mb-1.5">
                New password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
                autoFocus
                className="w-full h-9 px-3 text-[13px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg focus:outline-none focus:border-friday-accent"
              />
            </label>

            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-friday-fg-subtle mb-1.5">
                Confirm password
              </span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full h-9 px-3 text-[13px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg focus:outline-none focus:border-friday-accent"
              />
            </label>

            {error && (
              <p className="text-[12px] text-red-700 dark:text-red-400 leading-snug">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={phase === "submitting"}
              className="w-full h-10 rounded bg-friday-accent text-white text-[13px] font-medium tracking-wide hover:opacity-90 transition-colors duration-100 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {phase === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Set new password"
              )}
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              Password changed
            </p>
            <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
              All set.
            </h1>
            <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
              Redirecting you to sign in…
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
