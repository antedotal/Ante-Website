import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Canonical backend bytes retain their accepted comments/unused capability
  // argument; frontend lint does not rewrite this pinned source distribution.
  { files: ["lib/payments/bridge-v1/**/*.ts", "lib/payments/bridge-v3/**/*.ts"], linterOptions: { reportUnusedDisableDirectives: "off" }, rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Ignore OpenNext and Wrangler output so lint checks only maintained source.
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
