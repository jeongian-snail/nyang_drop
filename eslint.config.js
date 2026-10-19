import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default defineConfig([
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/vendor/**', 'dist/cat-outlines.js'],
  },
  prettier,
  {
    files: ['**/*.{js,mjs}', 'dist/**/*.html'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['dist/**/*.{js,html}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['dist/**/*.html'],
    plugins: { html },
  },
  {
    files: ['*.config.{js,mjs}', 'tests/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
]);
