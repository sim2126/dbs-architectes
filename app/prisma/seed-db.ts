/**
 * The one way a seed script connects.
 *
 * Every seed used to build its own PrismaNeon adapter inline — three copies of
 * the same four lines — and all three could only reach Neon. This mirrors the
 * runtime switch in src/platform/db: DATABASE_ADAPTER=pg selects node-postgres
 * for any plain PostgreSQL (the load-test staging container, a future Aurora
 * target), and the default remains Neon so nothing changes for the demo.
 *
 * Deliberately not importing "@/platform/db": the seeds take their connection
 * string from the seed-safety guard, which has already validated the exact
 * target, rather than from a module that reads DATABASE_URL on its own.
 */

import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";

export function createSeedPrisma(connectionString: string): PrismaClient {
  if (process.env.DATABASE_ADAPTER === "pg") {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  neonConfig.webSocketConstructor = ws;
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}
