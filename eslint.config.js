export default [
  { ignores: ["**/*.bak", "**/*.min.js", "**/vendor/**", "**/.artifacts/**", "**/artifacts/**"] },

  {
    files: ["app/static/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",

        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        FormData: "readonly",

        // fetch stack
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        FormData: "readonly",

        console: "readonly",

        Stripe: "readonly",
        paypal: "readonly"
      }
    },
    rules: {
      "no-console": "off",
      "no-undef": "error",
      "no-unused-vars": ["warn", {
        "args": "none",
        "vars": "all",
        "caughtErrors": "none",
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }]
    }
  }
];
