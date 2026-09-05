import { assertLocalDatabaseTarget } from "./target-safety.mjs";

/** Only an explicitly configured disposable local server may attest a target. */
export function acceptanceTarget(env) {
  if (!env.FRIDAY_LOAD_TARGET) return null;
  try {
    assertLocalDatabaseTarget(env);
    return env.FRIDAY_LOAD_TARGET;
  } catch {
    return null;
  }
}
