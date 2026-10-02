import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['test/ui/**/*.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    expect: { poll: { timeout: 15_000, interval: 100 } },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    onConsoleLog: (log) => !log.startsWith('{"time"'),
  },
})
