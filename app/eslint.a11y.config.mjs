// Accessibility lint — Annexure F.1 "WCAG 2.1 AA for primary user journeys".
//
// Separate from eslint.config.mjs on purpose: the main config is type-aware
// and takes minutes over the whole tree, while jsx-a11y needs only syntax.
// This runs in seconds, so it can gate every commit. `npm run lint:a11y`.
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.tsx"],
    ignores: ["**/.next/**", "**/node_modules/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "jsx-a11y": jsxA11y },
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
];
