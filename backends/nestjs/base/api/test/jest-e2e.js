// A `.js` config, not `.json` — it needs to inherit `moduleNameMapper` from package.json's own
// `jest` block so a recipe's `jestModuleNameMapper` contribution (see packageJson.ts) applies to
// e2e tests too, not just unit tests. `rootDir` here resolves relative to this file's own
// location (`api/test/`), so `..` means `api/` — matching package.json's own `jest.rootDir: "."`
// (relative to `api/`) so a moduleNameMapper value like `<rootDir>/test/__mocks__/...` resolves
// identically under both configs.
const packageJson = require('../package.json');

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  testRegex: '\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: packageJson.jest?.moduleNameMapper,
};
