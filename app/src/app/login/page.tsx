"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/ui/components/button";
import { Card, CardContent } from "@/ui/components/card";
import { Input } from "@/ui/components/input";
import { Label } from "@/ui/components/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"credentials" | "mfa">("credentials");
  const [mfaCode, setMfaCode] = useState("");

  async function attemptSignIn(code?: string) {
    return signIn("credentials", {
      email,
      password,
      mfaCode: code ?? "",
      redirect: false,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await attemptSignIn();
    setLoading(false);

    if (result?.error) {
      // NextAuth wraps thrown errors in a generic "CredentialsSignin" code,
      // but the underlying message is surfaced on result.code in v5.
      const code = (result as { code?: string }).code ?? result.error;
      if (code.includes("MFA_REQUIRED")) {
        setStage("mfa");
        return;
      }
      setError("Invalid credentials. Please verify your account and try again.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await attemptSignIn(mfaCode.replace(/\s/g, ""));
    setLoading(false);

    if (result?.error) {
      const code = (result as { code?: string }).code ?? result.error;
      if (code.includes("MFA_INVALID")) {
        setError("That code didn't verify. Check the clock on your authenticator and try again.");
        setMfaCode("");
        return;
      }
      setError("Sign-in failed. Please start over.");
      setStage("credentials");
      setMfaCode("");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  function backToCredentials() {
    setStage("credentials");
    setMfaCode("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa_0%,#ffffff_32%,#f7f4ef_100%)] px-6 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_54%,#155e75_100%)] p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              {/* DBS | Friday logo mark — white version for dark bg */}
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-11 h-11 shrink-0">
                <rect x="2" y="2" width="28" height="28" stroke="white" strokeWidth="2.8"/>
                <rect x="23.5" y="2" width="6.5" height="6.5" fill="#c9a96e"/>
                <rect x="2" y="23.5" width="6.5" height="6.5" fill="#c9a96e"/>
                <text x="16" y="20.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="white" fontFamily="system-ui, -apple-system, sans-serif">DBS</text>
              </svg>
              <div>
                <p className="text-lg font-semibold tracking-tight">DBS <span className="font-light text-white/60">| Friday</span></p>
                <p className="text-xs text-white/55">AI-native project workspace</p>
              </div>
            </div>

            <div className="mt-12 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Private workspace access</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-tight">
                Enter the product experience prepared for the Friday.com demo.
              </h1>
              <p className="mt-5 text-sm leading-8 text-white/75">
                The platform combines structured project management, role-based operations, and a differentiated AI layer across regulations, precedent retrieval, and planning support.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Sparkles, title: "AI copilots", text: "Operations, gallery, and planning intelligence" },
                { icon: Users, title: "Role-based", text: "Admin, manager, and collaborator views" },
                { icon: Lock, title: "Secure access", text: "Centralized permissions and ownership" },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                  <item.icon className="h-4 w-4 text-[#bfdbfe]" />
                  <p className="mt-3 text-sm font-semibold">{item.title}</p>
                  <p className="mt-2 text-xs leading-6 text-white/70">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-10 text-sm text-white/70">
              Demonstration environment for Friday.com.
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="flex items-center justify-center"
        >
          <Card className="w-full max-w-lg rounded-[32px] border-white/80 bg-white/88 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-8 sm:p-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {stage === "credentials" ? "Workspace sign in" : "Two-factor verification"}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                  {stage === "credentials" ? "Access the Friday.com platform" : "One more step"}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {stage === "credentials"
                    ? "Use the demo credentials below to enter the dashboard and present the product."
                    : `Signed in as ${email}.`}
                </p>
              </div>

              {stage === "credentials" ? (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@friday.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="h-12 rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="password">Password</Label>
                      <a
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 hover:no-underline transition-colors"
                      >
                        Forgot password?
                      </a>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        autoComplete="current-password"
                        className="h-12 rounded-2xl pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20">
                      {error}
                    </div>
                  )}

                  <Button type="submit" size="xl" className="w-full rounded-2xl" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in
                      </>
                    ) : (
                      <>
                        Enter workspace
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleMfaSubmit} className="mt-8 space-y-5">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
                    Two-factor authentication is enabled on this account. Enter the
                    6-digit code from your authenticator app to continue.
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mfa-code">Authentication code</Label>
                    <Input
                      id="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123 456"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      required
                      maxLength={10}
                      className="h-12 rounded-2xl tracking-[0.4em] text-center text-lg font-semibold"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20">
                      {error}
                    </div>
                  )}

                  <Button type="submit" size="xl" className="w-full rounded-2xl" disabled={loading || mfaCode.length < 6}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying
                      </>
                    ) : (
                      <>
                        Verify and enter
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={backToCredentials}
                    className="block w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground hover:no-underline transition-colors"
                  >
                    Use a different account
                  </button>
                </form>
              )}

              {stage === "credentials" && (
                <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1.5">Demo credentials</p>
                  <div className="space-y-0.5 font-mono text-xs text-blue-800">
                    <p>Email: <span className="font-semibold">admin@dbsarc.com</span></p>
                    <p>Password: <span className="font-semibold">admin123</span></p>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
