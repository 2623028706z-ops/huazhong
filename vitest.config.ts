import { defineConfig } from 'vitest/config'

// 各包的测试配置在各自目录；覆盖率门槛只卡纯函数（00 章第 11.5 节：不低于 90%）
export default defineConfig({
  test: {
    projects: ['shared', 'server', 'miniapp', 'scripts'],
    coverage: {
      provider: 'v8',
      include: [
        'shared/src/format.ts',
        'shared/src/realtime.ts',
        'shared/src/rules.ts',
        'server/src/**/domain/**/*.ts',
      ],
      thresholds: { lines: 90 },
    },
  },
})
