// eslint.config.mjs (ESLint v9 flat config)
import globals from "globals";

export default [
  // Ignore legacy/extracted/template-derived artifacts
  {
    ignores: [
      "**/node_modules/**",
      "**/.cache/**",
      "**/.playwright/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "app/static/js/extracted/**",
      "app/static/js/**/*.min.js",
      "app/static/css/**/*.min.css",
      // legacy bundles you don’t want linted (keep/edit as needed)
      "app/static/js/app.bundle.js",
      "app/static/js/app.entry.js",
      "app/static/js/app.js",
      "app/static/js/campaign*.js",
      "app/static/js/donation*.js",
    ],
  },

  // Ship lane: ff runtime + tools
  {
    files: ["app/static/js/ff*.{js,mjs}", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Safety / correctness
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-redeclare": "error",
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],

      // Quality (keep calm, avoid over-policing)
      "eqeqeq": ["error", "always"],
      "no-console": "off", // you already gate console errors in Playwright
    },
  },
];
