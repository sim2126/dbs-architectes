import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma 7 needs a driver adapter. Two are wired, selected by DATABASE_ADAPTER.
 *
 *   (unset) / "neon"  — Neon's serverless driver over WebSocket. The demo
 *                       posture on Vercel + Neon; unchanged default.
 *   "pg"              — node-postgres over TCP, for any plain PostgreSQL.
 *
 * The pg path exists for two reasons. Load and concurrency testing needs a
 * throwaway database that can be hammered without touching the demo data or
 * Neon's compute budget, and the Neon driver cannot speak to a plain Postgres
 * container. More durably, the production target is Aurora Serverless v2,
 * which is not Neon either — so a non-Neon path is a requirement, not a test
 * convenience. Same PrismaClient either way; nothing above this module knows
 * which driver it is talking to.
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL!;
  if (process.env.DATABASE_ADAPTER === "pg") {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  neonConfig.webSocketConstructor = ws;
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
