
import { fileURLToPath } from "url";
import { dirname } from "path";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const baseConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];

const eslintConfig = [
  ...baseConfig,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
];

export default eslintConfig;

