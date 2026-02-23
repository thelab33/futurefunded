// stylelint.config.cjs
module.exports = {
  extends: ["stylelint-config-standard", "stylelint-config-recess-order"],
  plugins: ["stylelint-order"],
  ignoreFiles: [
    "**/node_modules/**",
    "**/.cache/**",
    "**/.playwright/**",
    "**/test-results/**",
    "**/playwright-report/**",
    // Only lint ff.css via script anyway, but keep ignore defensive:
    "app/static/css/**/*.min.css",
  ],
  rules: {
    // Keep it strict, but not annoying
    "declaration-block-no-duplicate-properties": true,
    "no-descending-specificity": null, // your layered + contract CSS can trigger this legitimately
    "font-family-no-missing-generic-family-keyword": null,
    "selector-class-pattern": null,
    "custom-property-pattern": null,
  },
};
