import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Force the canonical DBS Friday domain on production.
 *
 * Vercel auto-generates a per-deployment URL for every build
 * (`app-<hash>-prabhakar-kumars-projects-<id>.vercel.app`). Those URLs
 * are Vercel-internal and can't be deleted, but anyone who lands on one
 * should be 308-redirected to `friday-dbs.vercel.app` so there is only
 * one public domain for DBS demos, sharing, and deep-links.
 *
 * Preview branch deployments (VERCEL_ENV=preview) stay viewable under
 * their own URL so preview-review-before-merge workflows still work.
 * Local development (no VERCEL_ENV) is untouched.
 */

const CANONICAL_HOST = "friday-dbs.vercel.app";

export function proxy(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.next();
  }

  const host = req.headers.get("host") ?? "";
  if (host === CANONICAL_HOST) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Exclude API routes, Next internals, and static assets so we don't
  // break webhook endpoints, HMR, or image optimisation.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
