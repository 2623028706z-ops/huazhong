// 下单、发货、售后提交时的纯函数规则（03 章第 4、5 节）
import { AppError, copy } from '@huazhong/shared'
import { describe, expect, test } from 'vitest'
import {
  checkClaims,
  checkProcess,
  orderableEntries,
  shippedQtysOf,
  type CatalogEntry,
} from '../../src/modules/sales/domain/order-rules.ts'

// 取出抛出的业务错误，断言 code / message / fields
function errorOf(run: () => unknown): AppError {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('expected AppError')
}

const entry = (productId: number, change: Partial<CatalogEntry> = {}): CatalogEntry => ({
  productId,
  name: `产品${productId}`,
  unit: '束',
  customerCode: '',
  productEnabled: true,
  catalogEnabled: true,
  listPriceCents: 6800,
  ...change,
})

const stopped = (names: string) => `${names}已停用`

describe('orderableEntries', () => {
  test('按传入顺序返回可订的目录项', () => {
    const picked = orderableEntries([2, 1], [entry(1), entry(2)], stopped)
    expect(picked.map((e) => e.productId)).toEqual([2, 1])
  })

  test('产品不存在 → NOT_FOUND', () => {
    expect(errorOf(() => orderableEntries([9], [entry(1)], stopped)).code).toBe('NOT_FOUND')
  })

  test('不在目录里 → 「不在可订产品里」', () => {
    const error = errorOf(() =>
      orderableEntries([1], [entry(1, { listPriceCents: null, catalogEnabled: null })], stopped),
    )
    expect(error).toMatchObject({ code: 'BUSINESS_RULE' })
    expect(error.message).toContain('产品1')
  })

  test('目录停用和产品停用都算停用，名字一起报', () => {
    const entries = [entry(1, { catalogEnabled: false }), entry(2, { productEnabled: false })]
    const error = errorOf(() => orderableEntries([1, 2], entries, stopped))
    expect(error.code).toBe('BUSINESS_RULE')
    expect(error.message).toContain('产品1')
    expect(error.message).toContain('产品2')
  })
})

describe('shippedQtysOf', () => {
  const lines = [
    { id: 1, qty: 10 },
    { id: 2, qty: 5 },
  ]
  const input = (a: number, b: number) => [
    { orderLineId: '1', shippedQty: a },
    { orderLineId: '2', shippedQty: b },
  ]

  test('全发：返回每行实发', () => {
    expect([...shippedQtysOf(lines, input(10, 5), '')]).toEqual([
      [1, 10],
      [2, 5],
    ])
  })

  test('少一行、多一行、重复一行都 422', () => {
    const missing = [{ orderLineId: '1', shippedQty: 10 }]
    expect(errorOf(() => shippedQtysOf(lines, missing, '')).code).toBe('VALIDATION_FAILED')
    const extra = [...input(10, 5), { orderLineId: '3', shippedQty: 1 }]
    expect(errorOf(() => shippedQtysOf(lines, extra, '')).code).toBe('VALIDATION_FAILED')
    const dup = [
      { orderLineId: '1', shippedQty: 1 },
      { orderLineId: '1', shippedQty: 1 },
    ]
    expect(errorOf(() => shippedQtysOf(lines, dup, '')).code).toBe('VALIDATION_FAILED')
  })

  test('实发没有上限，多发也需要备注', () => {
    expect(shippedQtysOf(lines, input(10, 5), '').get(2)).toBe(5)
    expect(errorOf(() => shippedQtysOf(lines, input(10, 6), '')).fields).toEqual({
      shipNote: copy.rework.shipDifferenceNoteRequired,
    })
  })

  test('全 0 不能发；少发要写备注，写了按实发', () => {
    expect(errorOf(() => shippedQtysOf(lines, input(0, 0), '备注')).code).toBe('BUSINESS_RULE')
    expect(errorOf(() => shippedQtysOf(lines, input(10, 0), '')).fields).toEqual({
      shipNote: copy.rework.shipDifferenceNoteRequired,
    })
    expect(shippedQtysOf(lines, input(10, 0), '缺货').get(2)).toBe(0)
  })
})

describe('checkClaims', () => {
  const lines = [{ id: 1, name: '粉玫瑰日常花束', maxQty: 3, shipPriceCents: 6800 }]

  test('数量刚好等于可申请数量、单价等于发货单价能过', () => {
    expect(() => {
      checkClaims(lines, [{ id: 1, qty: 3, priceCents: 6800 }], '超了')
    }).not.toThrow()
  })

  test('数量多 1、单价高 1 分，都标在那一行', () => {
    const error = errorOf(() => {
      checkClaims(lines, [{ id: 1, qty: 4, priceCents: 6801 }], '超了')
    })
    expect(error.fields).toEqual({
      'lines.0.qty': '超了',
      'lines.0.priceCents': '粉玫瑰日常花束的售后单价不能高于发货单价 ¥68.00',
    })
  })

  test('不是这张发货单的行 → NOT_FOUND', () => {
    const error = errorOf(() => {
      checkClaims(lines, [{ id: 9, qty: 1, priceCents: 100 }], '超了')
    })
    expect(error.code).toBe('NOT_FOUND')
  })
})

describe('checkProcess', () => {
  const lines = [
    { id: '1', name: '粉玫瑰日常花束', maxQty: 10, shipPriceCents: 6800 },
    { id: '2', name: '白绿清新花束', maxQty: 5, shipPriceCents: 7800 },
  ]

  test('只改已有的行：少一行、多一行、重复一行都拦', () => {
    const locked = '门店提交的售后只能改数量和单价'
    const one = [{ id: 1, qty: 1, priceCents: 6800 }]
    expect(
      errorOf(() => {
        checkProcess(lines, one)
      }).message,
    ).toBe(locked)
    const dup = [
      { id: 1, qty: 1, priceCents: 6800 },
      { id: 1, qty: 1, priceCents: 6800 },
    ]
    expect(
      errorOf(() => {
        checkProcess(lines, dup)
      }).message,
    ).toBe(locked)
    const other = [
      { id: 1, qty: 1, priceCents: 6800 },
      { id: 3, qty: 1, priceCents: 6800 },
    ]
    expect(
      errorOf(() => {
        checkProcess(lines, other)
      }).message,
    ).toBe(locked)
  })

  test('全 0 要改关闭；有一行大于 0 能过；超可申请数量标出', () => {
    const zero = [
      { id: 1, qty: 0, priceCents: 6800 },
      { id: 2, qty: 0, priceCents: 7800 },
    ]
    expect(
      errorOf(() => {
        checkProcess(lines, zero)
      }).message,
    ).toBe('数量都是 0，整张不处理请关闭售后并写原因')
    const some = [
      { id: 2, qty: 5, priceCents: 7800 },
      { id: 1, qty: 0, priceCents: 6800 },
    ]
    expect(() => {
      checkProcess(lines, some)
    }).not.toThrow()
    const over = [
      { id: 1, qty: 11, priceCents: 6800 },
      { id: 2, qty: 0, priceCents: 7800 },
    ]
    expect(
      Object.keys(
        errorOf(() => {
          checkProcess(lines, over)
        }).fields ?? {},
      ),
    ).toEqual(['lines.0.qty'])
  })
})
