import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const noRawHexMessage =
  "No raw hex in components. Use a Friday token " +
  "(src/ui/tokens.ts) or a Tailwind utility. If no token " +
  "fits, add one to globals.css first.";

/**
 * The "boundaries" block enforces the visibility rules from
 * CLAUDE.md §8.1. Each top-level src/ package is an "element type"
 * with explicit `allow` lists; violations show up at lint time
 * instead of code review.
 *
 * Element types (one per top-level src/ directory):
 *   app       → Next.js routes
 *   feature   → business features (one folder under src/features/)
 *   platform  → cross-cutting infrastructure
 *   ui        → pure presentation
 *   i18n      → translations + language store
 *
 * Cross-feature rule: features/<X>/** may NOT import features/<Y>/**.
 * The intentional exception — composing via another feature's public
 * barrel — is captured by the same-feature `${from.feature}` rule
 * below combined with the public barrel pattern. In practice, when a
 * route or feature imports from "@/features/foo" the path resolves to
 * features/foo/index.ts and is treated as belonging to the "foo"
 * feature element; cross-feature imports use a different relative
 * path which the matcher rejects.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*.{ts,tsx}"],
      "boundaries/elements": [
        { type: "app",      pattern: "src/app/**" },
        { type: "feature",  pattern: "src/features/*", mode: "folder", capture: ["feature"] },
        { type: "platform", pattern: "src/platform/**" },
        { type: "ui",       pattern: "src/ui/**" },
        { type: "i18n",     pattern: "src/i18n/**" },
      ],
    },
    rules: {
      // What each element type may import.
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          {
            from: "app",
            allow: ["app", "feature", "platform", "ui", "i18n"],
          },
          {
            from: "feature",
            allow: [
              "platform",
              "ui",
              "i18n",
              // WorkItem is the shared assignment model consumed by project,
              // workload, and AI features through its public barrel.
              ["feature", { feature: "work-items" }],
              // Same-feature imports always OK.
              ["feature", { feature: "${from.feature}" }],
            ],
          },
          {
            from: "platform",
            allow: ["platform"],
          },
          {
            from: "ui",
            // ui/ is pure presentation in spirit. Two pragmatic exceptions:
            //   - i18n: translations are a presentation concern; making ui
            //     pull them through props at every level is busywork.
            //   - platform/integrations: ui/layout/header uses the Pusher
            //     client directly for real-time notifications. The clean
            //     fix is to extract a notifications feature; until then
            //     this dependency is admitted, not pretended away.
            allow: ["ui", "i18n", "platform"],
          },
          {
            from: "i18n",
            allow: ["i18n", "ui"],
          },
        ],
      }],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/app/globals.css",
      "src/ui/tokens.ts",
      "src/ui/vendor-brand.ts",
      // Agenda colour hex values are persisted data; CSS variables must not be stored in the database.
      "src/features/agenda/domain/agenda-colours.ts",
      "**/*.{test,spec}.{ts,tsx}",
      "**/__tests__/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}/]",
          message: noRawHexMessage,
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
          message: noRawHexMessage,
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
