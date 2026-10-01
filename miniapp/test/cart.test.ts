import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCarts,
  countOf,
  loadCart,
  pruneCart,
  qtyOf,
  saveCart,
  withQty,
} from '../miniprogram/core/cart'

const rose = { productId: '1', name: '粉玫瑰日常花束', unit: '束', listPriceCents: 6800 }
const lily = { productId: '2', name: '白绿清新花束', unit: '束', listPriceCents: 8000 }

function fakeStorage() {
  const store = new Map<string, unknown>()
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => store.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => store.set(key, value),
    removeStorageSync: (key: string) => store.delete(key),
    getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('门店购物车', () => {
  it('加购、改数量、减到 0 去掉这一行；件数按数量合计', () => {
    let lines = withQty([], rose, 2)
    lines = withQty(lines, lily, 1)
    lines = withQty(lines, rose, 5)
    expect(lines.map((line) => [line.productId, line.qty])).toEqual([
      ['1', 5],
      ['2', 1],
    ])
    expect(countOf(lines)).toBe(6)
    expect(qtyOf(lines, '2')).toBe(1)
    expect(withQty(lines, lily, 0).map((line) => line.productId)).toEqual(['1'])
  })

  it('按账号分开存，退出登录全部清空', () => {
    const store = fakeStorage()
    store.set('other-key', 'kept')
    saveCart('7', withQty([], rose, 2))
    saveCart('8', withQty([], lily, 1))
    expect(loadCart('7').map((line) => line.productId)).toEqual(['1'])
    expect(loadCart('8').map((line) => line.productId)).toEqual(['2'])
    clearCarts()
    expect(loadCart('7')).toEqual([])
    expect(loadCart('8')).toEqual([])
    expect(store.get('other-key')).toBe('kept')
  })

  it('存储里的坏数据不当成购物车行', () => {
    const store = fakeStorage()
    store.set('hz-cart:7', [{ productId: '1', qty: 0 }, { foo: 1 }, 'x'])
    expect(loadCart('7')).toEqual([])
  })

  it('按目录核对：停订的去掉并返回名称，在目录里的刷新名称和价格', () => {
    const lines = withQty(withQty([], rose, 2), lily, 1)
    const repriced = { ...rose, listPriceCents: 7000 }
    const pruned = pruneCart(lines, [repriced])
    expect(pruned.removed).toEqual(['白绿清新花束'])
    expect(pruned.lines).toEqual([
      { productId: '1', qty: 2, name: rose.name, unit: '束', priceCents: 7000 },
    ])
  })
})
