"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

type InvitationInfo = {
  email: string;
  role: string;
  inviterName: string | null;
  expiresAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  director: "Director",
  manager: "Manager",
  employee: "Member",
  intern: "Intern",
};

export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  // ── State ────────────────────────────────────────────
  const [phase, setPhase] = useState<"validating" | "form" | "invalid" | "accepting" | "done">(
    "validating",
  );
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── Validate token on mount ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/invitations/accept?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setPhase("invalid");
          return;
        }
        const data = (await res.json()) as InvitationInfo;
        setInvitation(data);
        setName(data.email.split("@")[0]);
        setPhase("form");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Accept submit ────────────────────────────────────
  const handleAccept = async (e: React.FormEvent) => {
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

    setPhase("accepting");
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't accept the invitation.");
        setPhase("form");
        return;
      }

      // Sign in with the newly-set credentials so the user lands logged in.
      if (!invitation) {
        setPhase("done");
        return;
      }
      const signInRes = await signIn("credentials", {
        email: invitation.email,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        // Account created but auto-login failed — fall back to manual.
        setPhase("done");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPhase("form");
    }
  };

  // ── Renders ──────────────────────────────────────────
  return (
    <main className="min-h-screen bg-friday-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {phase === "validating" && (
          <div className="text-center space-y-3">
            <Loader2 className="h-5 w-5 animate-spin text-friday-fg-muted mx-auto" />
            <p className="font-display italic text-friday-fg-muted">
              Checking your invitation…
            </p>
          </div>
        )}

        {phase === "invalid" && (
          <div className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              Invitation
            </p>
            <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
              This link isn't valid anymore.
            </h1>
            <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
              The invitation may have expired, been revoked, or already been
              used. Ask whoever invited you to send a fresh link.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-[12.5px] text-friday-accent underline underline-offset-4 hover:no-underline"
            >
              Go to sign in
            </Link>
          </div>
        )}

        {(phase === "form" || phase === "accepting") && invitation && (
          <form
            onSubmit={handleAccept}
            className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 space-y-5"
          >
            <header>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
                DBS Friday · Invitation
              </p>
              <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
                Welcome,{" "}
                <span className="text-friday-fg">
                  {invitation.email.split("@")[0]}
                </span>
                .
              </h1>
              <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
                {invitation.inviterName ? `${invitation.inviterName} ` : ""}
                invited you to join the workspace as{" "}
                <span className="text-friday-fg">
                  {ROLE_LABEL[invitation.role] ?? invitation.role}
                </span>
                . Set a password to finish.
              </p>
            </header>

            <div className="space-y-3.5">
              <Field label="Email">
                <input
                  value={invitation.email}
                  readOnly
                  disabled
                  className="w-full h-9 px-3 text-[12.5px] font-mono bg-friday-surface-2 border border-friday-border-soft rounded text-friday-fg-muted"
                />
              </Field>

              <Field label="Full name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
                  required
                />
              </Field>

              <Field label="Password" hint="At least 10 characters.">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </Field>

              <Field label="Confirm password">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
                  required
                  autoComplete="new-password"
                />
              </Field>
            </div>

            {error && (
              <p className="text-[12px] text-red-700 dark:text-red-400 leading-snug">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={phase === "accepting"}
              className="w-full h-10 rounded bg-friday-accent text-white text-[13px] font-medium tracking-wide hover:opacity-90 transition-colors duration-100 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {phase === "accepting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                "Set password and join"
              )}
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="border border-friday-border-soft rounded-md bg-friday-surface px-6 py-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              You're in
            </p>
            <h1 className="font-display italic text-friday-fg text-3xl leading-tight mt-2">
              Account created.
            </h1>
            <p className="text-[13px] text-friday-fg-muted mt-3 leading-relaxed">
              You can sign in with your new password.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-[12.5px] text-friday-accent underline underline-offset-4 hover:no-underline"
            >
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-friday-fg-subtle mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-friday-fg-subtle mt-1">{hint}</span>
      )}
    </label>
  );
}
