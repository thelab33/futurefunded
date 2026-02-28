/**
 * Minimal ESLint flat config (cjs)
 * Use languageOptions.globals instead of env.
 */
module.exports = [
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      // recovery: intentionally empty
    },
  },
];
