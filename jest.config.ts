// jest.config.ts

import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Map @/ imports to the project root (same as tsconfig paths)
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Allow ts-jest to handle modern TS without strict module issues
        module: 'commonjs',
      },
    }],
  },
}

export default config
