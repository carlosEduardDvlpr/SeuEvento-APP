import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.vite/**',
      'apps/api/src/generated/**',
      'apps/web/public/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // §2.3: `any` e `@ts-ignore` são proibidos; `@ts-expect-error` exige justificativa.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],

      // §2.2: log é `request.log` ou o logger do pino. Nunca console.
      'no-console': 'error',

      // §7.1: ESM com `verbatimModuleSyntax` exige import de tipo explícito.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-restricted-syntax': [
        'error',
        {
          // §7.3: `new Date('2026-12-24')` é lido como UTC e desloca o dia no fuso do negócio.
          selector: "NewExpression[callee.name='Date'] > Literal[value=/^\\d{4}-\\d{2}-\\d{2}$/]",
          message:
            "Use parseISODate() de lib/dates.ts: new Date('YYYY-MM-DD') é interpretado como UTC e desloca o dia.",
        },
      ],
    },
  },

  {
    ...reactHooks.configs.flat['recommended-latest'],
    files: ['apps/web/**/*.{ts,tsx}'],
  },

  /*
   * Ferramentas de linha de comando: script de build e captura de telas.
   *
   * Os globais estão listados à mão em vez de trazer o pacote `globals` só para
   * isto (§2.3): são cinco nomes, e a lista explícita mostra de que o script
   * realmente depende. `console` é liberado porque nestes arquivos ele **é** a
   * saída da ferramenta — não existe `request.log` num script, e um relatório
   * que ninguém lê no terminal não serve para nada.
   */
  {
    files: ['**/scripts/*.mjs', 'e2e/screens/*.capture.ts'],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  prettier,
);
