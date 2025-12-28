module.exports = {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-recommended',
    'stylelint-config-prettier-scss',
  ],
  plugins: [
    'stylelint-scss',
  ],
  rules: {
    // Example: allow SCSS nesting
    'scss/at-rule-no-unknown': [true, {
      ignoreAtRules: [
        'extend', 'at-root', 'content', 'include', 'mixin', 'if', 'else', 'for', 'each', 'while', 'function', 'return', 'use', 'forward'
      ]
    }],
    // Add or override rules as needed
  },
};
