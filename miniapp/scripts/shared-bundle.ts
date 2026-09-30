// @huazhong/shared 连同 Zod 打成一个 CommonJS 文件的打包参数（01 章第 3.1 节）：prepare.ts 和打包测试共用
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BuildOptions } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const sharedBundleOutfile = join(
  root,
  'miniprogram/miniprogram_npm/@huazhong/shared/index.js',
)

export const sharedBundleOptions: BuildOptions = {
  // 小程序专用入口：先关 Zod 的 JIT（shared/src/zod-jitless.ts）
  entryPoints: [join(root, '../shared/src/miniapp.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['source'],
  target: 'es2017',
  minify: true,
  legalComments: 'none',
}
