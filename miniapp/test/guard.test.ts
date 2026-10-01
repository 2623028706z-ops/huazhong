import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leavePage } from '../miniprogram/core/guard'

// 记录调用顺序：系统确认框必须在返回之前关掉，否则微信会再问一次
let order: string[]

beforeEach(() => {
  order = []
  vi.stubGlobal('wx', {
    enableAlertBeforeUnload: () => order.push('enableAlert'),
    disableAlertBeforeUnload: () => order.push('disableAlert'),
    navigateBack: () => {
      order.push('navigateBack')
      return Promise.resolve()
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function hostAnswering(answer: boolean) {
  const ask = vi.fn(() => Promise.resolve(answer))
  return { host: { selectComponent: () => ({ ask }) }, ask }
}

describe('顶栏返回的放弃修改', () => {
  it('确认放弃：先关系统确认框再返回，只问一次', async () => {
    const { host, ask } = hostAnswering(true)
    await leavePage(host, true)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['disableAlert', 'navigateBack'])
  })

  it('选继续编辑：不返回，系统确认框保持开着', async () => {
    const { host } = hostAnswering(false)
    await leavePage(host, true)
    expect(order).toEqual([])
  })

  it('没改过：不问，直接返回', async () => {
    const { host, ask } = hostAnswering(true)
    await leavePage(host, false)
    expect(ask).not.toHaveBeenCalled()
    expect(order).toEqual(['disableAlert', 'navigateBack'])
  })
})
