import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
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
          user.password
        );

        if (!isValid) return null;

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
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role?: string; employmentStatus?: string; defaultCountry?: string | null; defaultRegion?: string | null };
        token.role = u.role;
        token.id = user.id;
        token.employmentStatus = u.employmentStatus;
        token.defaultCountry = u.defaultCountry ?? null;
        token.defaultRegion = u.defaultRegion ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.employmentStatus = (token.employmentStatus as string) ?? "active";
        session.user.defaultCountry = (token.defaultCountry as string | null) ?? null;
        session.user.defaultRegion = (token.defaultRegion as string | null) ?? null;
      }
      return session;
    },
  },
});

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
    };
  }
}

