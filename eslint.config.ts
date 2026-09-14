import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'public/data/**', 'playwright-report/**', 'worker/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      /* SPEC §11.3 t. 3 i 4: determinizam i vremenska zona.
         Math.random() i izravni Date API dopušteni su samo ondje gdje su namjerni. */
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Vrijeme ide kroz engine/time.ts (Europe/Zagreb). SPEC §5.1.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Mete su determinističke — koristi engine/seed.ts. SPEC §5.2.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Vrijeme ide kroz engine/time.ts (Europe/Zagreb). SPEC §5.1.',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['src/engine/time.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },

  {
    files: ['scripts/**/*.ts', 'tests/**/*.{ts,tsx}', '*.config.ts', 'eslint.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },

  prettier,
);
