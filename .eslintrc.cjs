module.exports = {
  root: true,
  env: {
    node: true
  },
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  plugins: [
      '@typescript-eslint',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin  ],
  ],
    parserOptions: {
    ecmaVersion: 2020
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-unused-vars': [ 2, { args: 'all', argsIgnorePattern: "^_"} ]
  }
}
