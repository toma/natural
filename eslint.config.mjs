import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "coverage/**",
      "node_modules/**",
      "**/target/**",
      "**/.natural/**",
      "eslint.config.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["examples/urban-raid/src/**/*.js", "examples/urban-raid/tools/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "window",
          "document",
          "navigator",
          "location",
          "performance",
          "crypto",
          "console",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "addEventListener",
          "removeEventListener",
          "innerWidth",
          "innerHeight",
          "devicePixelRatio",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "URLSearchParams",
          "localStorage",
          "AudioContext",
          "OfflineAudioContext",
          "Float32Array",
          "Uint8Array",
          "Uint32Array",
          "ImageData",
          "process",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      // Preserve unused upstream tuning arguments and locals for source comparison.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/prefer-for-of": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/adjacent-overload-signatures": "off",
    },
  },
);
