import { defineProject } from 'vitest/config'

// 接口测试：globalSetup 起一个 PostgreSQL 容器、建好模板库；每个测试从模板复制一个干净的库
export default defineProject({
  ssr: { resolve: { conditions: ['source'] } },
  resolve: { conditions: ['source'] },
  test: {
    name: 'server',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
