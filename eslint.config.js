import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "dev-dist", "node_modules", ".cache", "pocketbase/pb_data"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, __BUILD_TIME__: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**", "test/**", "e2e/**", "vite.config.js", "vitest*.config.js", "eslint.config.js", "**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // PocketBase-JSVM (Migrationen/Hooks laufen im Server, nicht im Browser)
    files: ["pocketbase/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { migrate: "readonly", Collection: "readonly", RelationField: "readonly", routerAdd: "readonly",
        onRecordAfterUpdateSuccess: "readonly", $app: "readonly", $os: "readonly" },
    },
  },
];
