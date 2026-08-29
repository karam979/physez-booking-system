import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Express error handlers must keep the 4-arg signature; prefix unused args with _.
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
    },
  },
  prettier,
]
