import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16+ exports flat configs directly; wrapping them in FlatCompat crashes ESLint.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Capacitor native projects contain copies of the built site
    "android/**",
    "ios/**",
    // Prebuilt audio worklets copied by scripts/copy-audio-worklets.mjs
    "public/audio/**",
  ]),
]);

export default eslintConfig;
