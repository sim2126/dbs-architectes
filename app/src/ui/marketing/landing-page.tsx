"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function LandingPage({ hasSession }: { hasSession: boolean }) {
  return (
    <div className="min-h-screen bg-[#fafaf8] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 flex flex-col">
      {/* ─── Top bar ─── */}
      <header className="flex items-center justify-between px-8 md:px-12 py-6">
        <Link href="/" className="flex items-center gap-3">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8"
          >
            <rect x="2" y="2" width="28" height="28" stroke="currentColor" strokeWidth="2.8" />
            <rect x="23.5" y="2" width="6.5" height="6.5" fill="#c9a96e" />
            <rect x="2" y="23.5" width="6.5" height="6.5" fill="#c9a96e" />
            <text
              x="16"
              y="20.5"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="800"
              fill="currentColor"
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              DBS
            </text>
          </svg>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight">DBS Architectes</span>
            <span className="text-[11px] text-neutral-500 tracking-wider mt-0.5">
              Friday · Workspace
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          {hasSession ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full bg-neutral-900 text-neutral-50 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              Open workspace
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 px-3 py-2 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full bg-neutral-900 text-neutral-50 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <main className="flex-1 flex items-center px-8 md:px-12">
        <div className="max-w-5xl mx-auto w-full py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 mb-6">
              Sion · Milano · Srinagar
            </p>

            <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-light leading-[1.05] tracking-tight mb-8">
              DBS Architectes
              <br />
              <span className="text-neutral-500">welcomes you to</span>
              <br />
              <span className="font-serif italic">Friday.</span>
            </h1>

            <p className="text-lg md:text-xl text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl mb-12 font-light">
              Your workspace for better task management and efficiency.
              <br />
              Built for the studio — projects, meetings, drawings, and decisions in one quiet place.
            </p>

            <div className="flex flex-wrap gap-3">
              {hasSession ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 text-base font-medium px-6 py-3 rounded-full bg-neutral-900 text-neutral-50 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
                >
                  Enter workspace
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-base font-medium px-6 py-3 rounded-full bg-neutral-900 text-neutral-50 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
                  >
                    Log in
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/login?mode=signup"
                    className="inline-flex items-center gap-2 text-base font-medium px-6 py-3 rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </motion.div>

          {/* Thin divider row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="mt-24 md:mt-32 pt-8 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm"
          >
            {[
              { k: "Projects", v: "48+" },
              { k: "Studio", v: "Since 2014" },
              { k: "Offices", v: "CH · IT · IN" },
              { k: "Team", v: "30 architects" },
            ].map((item) => (
              <div key={item.k}>
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-1">
                  {item.k}
                </div>
                <div className="font-light text-xl">{item.v}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="px-8 md:px-12 py-8 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 flex flex-wrap justify-between gap-4">
        <span>© DBS Architectes · Sustainable Architectural, Urban and Landscape design</span>
        <span className="tracking-wider">Friday · v1</span>
      </footer>
    </div>
  );
}
