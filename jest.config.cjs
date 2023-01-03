module.exports = {
    roots: ['<rootDir>'],
    preset: 'ts-jest/presets/default-esm', // or other ESM presets
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { useESM: true }]
    },
    testRegex: "\.spec\.(ts|tsx|js)$",
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    reporters: ["default", "jest-junit"],
    testResultsProcessor: "jest-teamcity-reporter",
    setupFiles: ["./.env.test"],
    coverageReporters: ["lcov", "text", "teamcity"],
    testTimeout: 30 * 1000,
    testEnvironment: "jsdom"
}
