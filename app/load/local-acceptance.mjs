import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertLocalBaseUrl, assertLocalDatabaseTarget } from "./target-safety.mjs";

const env = {
  ...process.env,
  DATABASE_URL: "postgresql://friday:friday-local-test@127.0.0.1:55433/friday_review?schema=public",
  DATABASE_ADAPTER: "pg",
  FRIDAY_LOAD_TARGET: "127.0.0.1:55433/friday_review?schema=public",
  FRIDAY_DEMO_SEED_TARGET: "127.0.0.1:55433/friday_review?schema=public",
  FRIDAY_DEMO_SEED_ALLOW: "I_UNDERSTAND_THIS_REPLACES_DEMO_DATA",
  BASE_URL: "http://localhost:3100",
  AUTH_URL: "http://localhost:3100",
  NEXTAUTH_URL: "http://localhost:3100",
  AUTH_TRUST_HOST: "true",
  AUTH_SECRET: "friday-local-acceptance-only",
  NEXTAUTH_SECRET: "friday-local-acceptance-only",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  UPLOADS_S3_BUCKET: "",
  PUSHER_APP_ID: "friday-test",
  PUSHER_KEY: "friday-test-key",
  PUSHER_SECRET: "friday-test-secret",
  PUSHER_CLUSTER: "mt1",
  PUSHER_HOST: "127.0.0.1",
  PUSHER_PORT: "6001",
  NEXT_PUBLIC_PUSHER_KEY: "friday-test-key",
  NEXT_PUBLIC_PUSHER_CLUSTER: "mt1",
  NEXT_PUBLIC_PUSHER_HOST: "127.0.0.1",
  NEXT_PUBLIC_PUSHER_PORT: "6001",
};
assertLocalBaseUrl(env.BASE_URL);
assertLocalDatabaseTarget(env);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const steps = {
  prepare: [
    ["node_modules/prisma/build/index.js", "generate"],
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--import", "tsx", "prisma/seed-demo.ts"],
    ["--import", "tsx", "prisma/seed-demo-account.ts"],
    ["--import", "tsx", "prisma/seed-ai-files.ts"],
  ],
  build: [["node_modules/next/dist/bin/next", "build"]],
  start: [["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3100"]],
  test: [["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)]],
  concurrency: [["--import", "tsx", "load/concurrency.ts"]],
  scale: [["--import", "tsx", "prisma/seed-scale.ts", ...process.argv.slice(3)]],
};
const mode = process.argv[2];
if (!Object.hasOwn(steps, mode)) throw new Error("Use prepare, build, start, test, concurrency or scale.");
console.log(`Local acceptance ${mode}: ${env.FRIDAY_LOAD_TARGET}, ${env.BASE_URL}`);
for (const args of steps[mode]) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: appRoot, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) process.exit(code);
}
