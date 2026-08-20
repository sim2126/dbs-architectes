"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/ui/utils";
import { productSurfaceFlags } from "@/platform/feature-flags";
import { VENDOR_BRAND } from "@/ui/vendor-brand";

/**
 * Sign-in.
 *
 * Cream ground with a tiled wordmark, centred card, one primary action —
 * the register the reference establishes. Deliberately restrained: this is
 * the first surface a DBS partner sees and it should read as a studio's
 * portal, not a SaaS funnel.
 *
 * Deliberate departures from the reference:
 *
 *   - No Microsoft or GitHub sign-in. Not wanted.
 *   - Demo credentials only when NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS is set.
 *     Printing a working account on the sign-in page is fine for a demo and
 *     wrong the moment real staff use it.
 *
 * Google IS shown, ahead of its provider being wired. Rather than fail
 * silently on click — which is what makes a control feel broken — it says
 * the provider is not connected yet and points at the working path. One env
 * flag turns it into a real sign-in once platform/auth has the provider.
 *
 * The MFA step is preserved. The reference has no second stage, but TOTP
 * enrolment exists and dropping the step would lock out anyone enrolled.
 */

const SHOW_DEMO_CREDENTIALS =
  process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
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
      // NextAuth v5 wraps thrown errors in a generic CredentialsSignin code;
      // the underlying message arrives on result.code.
      const code = (result as { code?: string }).code ?? result.error;
      if (code.includes("MFA_REQUIRED")) {
        setStage("mfa");
        return;
      }
      setError("Those details did not match an account.");
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
        setError("That code did not verify. Check your authenticator's clock.");
        setMfaCode("");
        return;
      }
      setError("Sign-in failed. Please start again.");
      setStage("credentials");
      setMfaCode("");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-svh flex items-center justify-center bg-friday-bg px-4 py-10 overflow-hidden">
      <WordmarkField />

      <div className="relative w-full max-w-md">
        <header className="text-center mb-7">
          <div className="flex items-center justify-center gap-2.5">
            <span
              aria-hidden
              className="font-display italic text-foreground leading-none select-none"
              style={{ fontSize: "34px", fontWeight: 500 }}
            >
              d
            </span>
            <span className="text-sm font-semibold tracking-[0.24em] uppercase text-foreground">
              DBS
            </span>
            <span aria-hidden className="text-friday-fg-subtle">|</span>
            <span className="font-display italic text-foreground text-2xl leading-none">
              Friday
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2.5 tracking-wide">
            A secure workspace for the studio
          </p>
        </header>

        <div className="rounded-lg border border-friday-border bg-friday-surface shadow-[0_1px_2px_rgba(26,26,24,0.04),0_12px_32px_rgba(26,26,24,0.06)] overflow-hidden">
          <div aria-hidden className="h-1 w-full bg-friday-accent" />

          <div className="px-7 py-7">
            {stage === "credentials" ? (
              <>
                <h1 className="font-display italic text-foreground text-2xl leading-tight text-center">
                  Sign in
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1.5 mb-6">
                  Enter your details to reach your workspace.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="password" className="sr-only">
                        Password
                      </label>
                      <span />
                      <a
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Forgot password?
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className={cn(fieldClass, "pr-10")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-friday-fg-subtle hover:text-foreground transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(e) => setKeepSignedIn(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-friday-border accent-friday-accent"
                    />
                    Keep me signed in
                  </label>

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <button type="submit" disabled={loading} className={primaryClass}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Enter workspace
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <span className="h-px flex-1 bg-friday-border-soft" />
                  <span className="text-xs text-muted-foreground">
                    Or continue with
                  </span>
                  <span className="h-px flex-1 bg-friday-border-soft" />
                </div>

                <GoogleButton
                  onUnavailable={() =>
                    setError(
                      "Google sign-in is not connected yet. Please use your email and password.",
                    )
                  }
                />
              </>
            ) : (
              <>
                <h1 className="font-display italic text-foreground text-2xl leading-tight text-center">
                  Verification
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1.5 mb-6">
                  Enter the six-digit code from your authenticator.
                </p>

                <form onSubmit={handleMfaSubmit} className="space-y-4">
                  <label htmlFor="mfa" className="sr-only">
                    Authentication code
                  </label>
                  <input
                    id="mfa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    maxLength={7}
                    className={cn(
                      fieldClass,
                      "text-center font-mono text-lg tracking-[0.4em]",
                    )}
                  />

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <button type="submit" disabled={loading} className={primaryClass}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStage("credentials");
                      setMfaCode("");
                      setError("");
                    }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use a different account
                  </button>
                </form>
              </>
            )}

            {SHOW_DEMO_CREDENTIALS && stage === "credentials" && (
              <div className="mt-6 rounded-md border border-friday-border-soft bg-friday-surface-2 px-3.5 py-3">
                <p className="text-xs font-medium text-foreground">Demo access</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Any role at <span className="font-mono">@dbsarc.com</span> —
                  {" "}<span className="font-mono">admin</span>,{" "}
                  <span className="font-mono">manager</span>,{" "}
                  <span className="font-mono">pm</span>,{" "}
                  <span className="font-mono">employee</span>,{" "}
                  <span className="font-mono">intern</span>,{" "}
                  <span className="font-mono">viewer</span>. Password{" "}
                  <span className="font-mono">dbs2025</span>.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-friday-fg-subtle mt-6">
          DBS Architectes — Sustainable architectural, urban and landscape design
        </p>
      </div>
    </main>
  );
}

const fieldClass =
  "w-full rounded-md border border-friday-border bg-friday-surface px-3.5 py-2.5 text-sm " +
  "text-foreground placeholder:text-friday-fg-subtle " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-friday-accent-ring " +
  "focus-visible:border-friday-accent transition-colors";

const primaryClass =
  "w-full inline-flex items-center justify-center gap-2 rounded-md " +
  "bg-friday-accent px-4 py-2.5 text-sm font-medium text-friday-accent-fg " +
  "hover:opacity-95 disabled:opacity-70 transition-opacity " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-friday-accent-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-friday-surface";

/**
 * Google sign-in.
 *
 * Rendered whether or not the provider exists. When it does not, the click
 * explains why instead of doing nothing — a silent no-op reads as a bug,
 * and the user is left with no idea what to do next. The Google mark is
 * inline SVG in its official four colours, which are vendor brand values
 * and therefore not themed.
 */
function GoogleButton({ onUnavailable }: { onUnavailable: () => void }) {
  const enabled = productSurfaceFlags.googleSignIn;
  return (
    <button
      type="button"
      onClick={() => {
        if (!enabled) {
          onUnavailable();
          return;
        }
        void signIn("google", { callbackUrl: "/dashboard" });
      }}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2.5 rounded-md",
        "border border-friday-border bg-friday-surface px-4 py-2.5 text-sm",
        "text-foreground hover:bg-friday-surface-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-friday-accent-ring",
      )}
    >
      <GoogleMark />
      Sign in with Google
    </button>
  );
}

/** Google's mark in its official colours. Vendor brand values — never themed. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4 shrink-0">
      <path
        fill={VENDOR_BRAND.GOOGLE_SIGN_IN.BLUE}
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill={VENDOR_BRAND.GOOGLE_SIGN_IN.GREEN}
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18Z"
      />
      <path
        fill={VENDOR_BRAND.GOOGLE_SIGN_IN.YELLOW}
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill={VENDOR_BRAND.GOOGLE_SIGN_IN.RED}
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59C13.46.89 11.42 0 9 0A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-friday-error-border bg-friday-error-bg px-3 py-2 text-xs text-friday-error-fg leading-relaxed"
    >
      {children}
    </p>
  );
}

/**
 * Tiled wordmark background.
 *
 * Drawn in the DOM rather than shipped as an image: it stays crisp at any
 * density, costs no request, and re-tints from a token. aria-hidden and
 * select-none because it carries no information — it is texture.
 */
function WordmarkField() {
  const rows = 9;
  const perRow = 7;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center justify-around whitespace-nowrap"
          style={{
            height: `${100 / rows}%`,
            // Offset alternate rows so the grid does not read as a table.
            transform: `translateX(${r % 2 === 0 ? "-4%" : "4%"})`,
          }}
        >
          {Array.from({ length: perRow }).map((_, c) => {
            const italic = (r + c) % 3 === 0;
            const serif = (r + c) % 2 === 0;
            return (
              <span
                key={c}
                className={cn(
                  "text-friday-surface-3",
                  italic && "italic",
                  serif ? "font-display" : "font-sans font-bold",
                )}
                style={{ fontSize: `${34 + ((r * 7 + c * 5) % 26)}px` }}
              >
                DBS
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
