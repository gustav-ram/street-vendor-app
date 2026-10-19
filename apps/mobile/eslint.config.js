// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // i18next's default export is the instance; calling i18next.use()/changeLanguage() on it is intended.
    rules: { 'import/no-named-as-default-member': 'off' },
  },
]);
