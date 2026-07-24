import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/platform/db";
import bcrypt from "bcryptjs";
import { verifySync } from "otplib";
import { headers } from "next/headers";

const nextAuth = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode:  { label: "2FA code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        // Reject deactivated accounts before even comparing the password
        if (!user.isActive) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!isValid) return null;

        // MFA gate. If enrolled, require a valid TOTP code. Throwing a
        // specific Error subclass lets the login page surface the
        // "MFA required" state separately from "wrong password".
        if (user.mfaEnabledAt && user.mfaSecret) {
          const rawCode = (credentials.mfaCode as string | undefined)?.trim();
          if (!rawCode) {
            throw new Error("MFA_REQUIRED");
          }
          const code = rawCode.replace(/\s/g, "");
          const result = verifySync({
            token: code,
            secret: user.mfaSecret,
            epochTolerance: 1,
          });
          if (!result.valid) {
            throw new Error("MFA_INVALID");
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
          employmentStatus: user.employmentStatus,
          defaultCountry: user.defaultCountry,
          defaultRegion: user.defaultRegion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        // Initial sign-in. Capture profile-shaped claims AND create a
        // UserSession row so revoke-per-device works. The JWT carries
        // the row id; loadSubject() looks it up on every gated request.
        const u = user as {
          role?: string;
          employmentStatus?: string;
          defaultCountry?: string | null;
          defaultRegion?: string | null;
        };
        token.role = u.role;
        token.id = user.id;
        token.employmentStatus = u.employmentStatus;
        token.defaultCountry = u.defaultCountry ?? null;
        token.defaultRegion = u.defaultRegion ?? null;

        const h = await headers();
        const ua = h.get("user-agent")?.slice(0, 500) ?? null;
        const ip =
          h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          h.get("x-real-ip") ??
          null;
        const session = await prisma.userSession.create({
          data: { userId: user.id!, ip, userAgent: ua },
          select: { id: true },
        });
        token.sessionId = session.id;
      }
      // Keep the rest of the token intact across refreshes.
      void trigger;
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.employmentStatus = (token.employmentStatus as string) ?? "active";
        session.user.defaultCountry = (token.defaultCountry as string | null) ?? null;
        session.user.defaultRegion = (token.defaultRegion as string | null) ?? null;
        session.user.sessionId = (token.sessionId as string | undefined) ?? null;
      }
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Resolve a signed-in session against live account and session state.
 * All protected pages and routes import this function, so deactivation,
 * role changes, and per-device revocation take effect immediately.
 */
export async function auth() {
  const session = await nextAuth.auth();
  if (!session?.user?.id || !session.user.sessionId) return null;

  const [user, userSession] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        isActive: true,
        employmentStatus: true,
        defaultCountry: true,
        defaultRegion: true,
      },
    }),
    prisma.userSession.findUnique({
      where: { id: session.user.sessionId },
      select: { userId: true, revokedAt: true, lastSeenAt: true },
    }),
  ]);

  if (
    !user ||
    !user.isActive ||
    user.employmentStatus === "suspended" ||
    user.employmentStatus === "terminated" ||
    !userSession ||
    userSession.userId !== session.user.id ||
    userSession.revokedAt
  ) {
    return null;
  }

  session.user.role = user.role;
  session.user.employmentStatus = user.employmentStatus;
  session.user.defaultCountry = user.defaultCountry;
  session.user.defaultRegion = user.defaultRegion;

  if (userSession.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) {
    void prisma.userSession
      .update({
        where: { id: session.user.sessionId },
        data: { lastSeenAt: new Date() },
      })
      .catch((error: unknown) => console.warn("[auth] lastSeenAt update failed", error));
  }

  return session;
}

declare module "next-auth" {
  interface User {
    role?: string;
    employmentStatus?: string;
    defaultCountry?: string | null;
    defaultRegion?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      employmentStatus: string;
      defaultCountry: string | null;
      defaultRegion: string | null;
      sessionId: string | null;
    };
  }
}

