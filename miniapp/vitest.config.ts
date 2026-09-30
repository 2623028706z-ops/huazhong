import { defineProject } from 'vitest/config'

export default defineProject({
  // 测试跑在 Node 环境（Vite 的 ssr 解析），要在这里声明 source 条件才会直接用 shared 的源码而不是旧的 dist
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: { name: 'miniapp', include: ['test/**/*.test.ts'] },
})
