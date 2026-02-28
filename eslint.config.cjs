/**
 * Minimal ESLint flat-style config for recovery.
 * Flat configs should NOT use `root`. Use an array of config objects.
 */
module.exports = [
  {
    // Apply to JS files in the project
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    env: { browser: true, node: true, es2022: true },
    rules: {
      // intentionally empty during recovery; restore your full rules later
    },
  },
];
