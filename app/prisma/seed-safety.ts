const DESTRUCTIVE_CONFIRMATION = "I_UNDERSTAND_THIS_REPLACES_DEMO_DATA";

export type SeedTarget = {
  connectionString: string;
  identifier: string;
};

type SeedEnvironment = Record<string, string | undefined>;

/**
 * Refuse destructive demo seeding unless the operator names the exact target.
 * The confirmation deliberately excludes credentials, so it is safe to paste
 * into a shell history or CI variable.
 */
export function assertSafeDemoSeedTarget(
  env: SeedEnvironment = process.env,
): SeedTarget {
  const productionMarkers = [
    env.NODE_ENV,
    env.VERCEL_ENV,
    env.APP_ENV,
    env.FRIDAY_ENVIRONMENT,
  ];
  if (productionMarkers.some((value) => value?.toLowerCase() === "production")) {
    throw new Error("Demo seeding is disabled in production environments.");
  }

  if (env.FRIDAY_DEMO_SEED_ALLOW !== DESTRUCTIVE_CONFIRMATION) {
    throw new Error(
      `Set FRIDAY_DEMO_SEED_ALLOW=${DESTRUCTIVE_CONFIRMATION} to acknowledge that demo data will be replaced.`,
    );
  }

  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for demo seeding.");
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Demo seeding only supports PostgreSQL targets.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !databaseName) {
    throw new Error("DATABASE_URL must name both a host and a database.");
  }

  const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  const databaseSchema = parsed.searchParams.get("schema")?.trim() || "public";
  const identifier = `${host}/${databaseName}?schema=${databaseSchema}`;
  if (env.FRIDAY_DEMO_SEED_TARGET !== identifier) {
    throw new Error(
      `Set FRIDAY_DEMO_SEED_TARGET=${identifier} to confirm the exact database target.`,
    );
  }

  return { connectionString, identifier };
}

export const DEMO_SEED_CONFIRMATION = DESTRUCTIVE_CONFIRMATION;
