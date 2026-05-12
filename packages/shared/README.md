# packages/shared

Cross-language specs shared between `app/` (TypeScript) and `apps/api/` (Python). Anything that needs to be identical on both sides goes here.

## Current contents

- `auth/actions.yaml` — the single source of truth for the action vocabulary used by `authorize()`. Both sides import descriptions from here; on TS the action names are duplicated in `app/src/platform/authz/actions.ts` for typecheck-time enforcement; on Python (when AuthZ lands) the YAML will be loaded at runtime.

## When you add to this folder

A spec belongs here only if it must stay byte-identical across languages. Examples that fit: shared event names, error codes, action vocabulary, currency codes, country codes, status enums. Examples that don't: language-specific type definitions, build configs, README files.

Until codegen or a sync-check script lands, the contract is "edit the YAML, then mirror manually in the consuming language and add a branch to the AuthZ decision function."
