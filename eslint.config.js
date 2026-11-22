import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "panel/src/routeTree.gen.ts"] },
  {
    files: ["panel/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { globals: globals.browser },
    rules: {
      // Engines disagree on non-ISO strings: Firefox rejects Minecraft's
      // "2026-11-20 12:00:00 +0000" and snapshot ids are not ISO at all.
      // Parse with parseTime and format with formatDateTime/formatRelative.
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "parse",
          message: "Use parseTime from @/lib/format.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...[
          "Literal[raw=/^['\"]/]",
          "TemplateLiteral",
          "Identifier",
          "MemberExpression",
          "ChainExpression",
        ].map((type) => ({
          selector: `NewExpression[callee.name='Date'][arguments.length=1] > ${type}.arguments`,
          message:
            "new Date(value) parses strings inconsistently. Use parseTime, formatDateTime or formatRelative from @/lib/format; pass numbers through a call such as parseTime(...).",
        })),
      ],
    },
  },
  {
    files: ["vite.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
