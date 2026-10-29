// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "results/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "TSEnumDeclaration", message: "Erasable TypeScript only (PLAN section 6): no enum." },
        { selector: "TSModuleDeclaration[kind='namespace']", message: "Erasable TypeScript only: no namespace." },
        { selector: "TSParameterProperty", message: "Erasable TypeScript only: no parameter properties." },
        { selector: "Decorator", message: "Erasable TypeScript only: no decorators." },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "Source text is rendered as escaped React text nodes only (PLAN section 3.29).",
        },
      ],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "crypto", "react", "react-dom", "@supabase/*"],
              message: "src/core is pure TypeScript with no Node, Deno or DOM APIs (PLAN section 3.19).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tools/**/*.{ts,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*", "**/src/**", "**/eval/**"],
              message: "tools/ are standalone: Node built-ins only, nothing from src/ or eval/, no relative imports (PLAN section 7).",
            },
          ],
        },
      ],
    },
  },
);
