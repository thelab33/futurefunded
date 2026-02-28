/**
 * Minimal ESLint flat-style config (cjs variant)
 * Keeps linting on but avoids config-not-found errors during recovery.
 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    // intentionally empty for recovery; restore your full ruleset later
  }
};
