import vm from 'node:vm'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import type * as Shared from '@huazhong/shared'
import { sharedBundleOptions } from '../scripts/shared-bundle.ts'

type SharedModule = typeof Shared

// 按开发者工具里看到的样子模拟：new Function 不报错，但返回的东西不能调用
function FakeFunction(): object {
  return {}
}

async function loadInMiniProgram(): Promise<SharedModule> {
  const result = await build({ ...sharedBundleOptions, write: false, outfile: 'index.js' })
  const code = result.outputFiles[0]?.text ?? ''
  const sandbox = { module: { exports: {} }, Function: FakeFunction }
  vm.runInNewContext(
    `(function (module, exports, Function) {${code}\n})(module, module.exports, Function)`,
    sandbox,
  )
  return sandbox.module.exports as SharedModule
}

describe('打进小程序的 shared', () => {
  it('小程序里不能用 JIT，对象结构照样能校验', async () => {
    const shared = await loadInMiniProgram()
    const good = { code: 'STALE', message: '单据已被修改', fields: null, latest: null }
    expect(shared.errorBodySchema.safeParse(good).success).toBe(true)
    expect(shared.errorBodySchema.safeParse({ code: 'NOPE' }).success).toBe(false)
    expect(shared.phoneSchema.safeParse('13800138001').success).toBe(true)
    expect(shared.formatMoney(123450)).toBe('¥1,234.50')
  })
})
