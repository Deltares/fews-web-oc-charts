import type { JestConfigWithTsJest } from 'ts-jest'

const jestConfig: JestConfigWithTsJest = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    'd3': '<rootDir>/node_modules/d3/dist/d3.min.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testResultsProcessor: "jest-teamcity-reporter",
  testTimeout: 30 * 1000,
  setupFiles: ["./.env.test"],
  coverageReporters: ["lcov", "text", "teamcity"],
}

export default jestConfig
