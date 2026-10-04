import { expect, test } from 'vitest'
import {
  afterCreateSchema,
  afterProcessSchema,
  centsInputSchema,
  centsSchema,
  copy,
  nonNegativeIntSchema,
  positiveIntSchema,
  STORED_INT_MAX,
} from '../src/index.ts'

test('INTEGER 单值接受上限并拒绝上限加一，计算结果仍可超过 INTEGER 上限', () => {
  for (const schema of [
    positiveIntSchema('数量'),
    nonNegativeIntSchema('数量'),
    centsInputSchema('单价'),
  ]) {
    expect(schema.safeParse(STORED_INT_MAX).success).toBe(true)
    const result = schema.safeParse(STORED_INT_MAX + 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe(copy.error.numericRange)
  }
  expect(centsSchema.safeParse(STORED_INT_MAX + 1).success).toBe(true)
})

test('售后保存的总额检查乘积和多行累加，避免 INTEGER 总额写入溢出', () => {
  const line = {
    orderLineId: '1',
    qty: 1,
    priceCents: STORED_INT_MAX,
    reason: 'qty_mismatch',
    description: '',
  }
  expect(afterCreateSchema.safeParse({ orderId: '1', note: '', lines: [line] }).success).toBe(true)
  expect(
    afterCreateSchema.safeParse({ orderId: '1', note: '', lines: [{ ...line, qty: 2 }] }).success,
  ).toBe(false)
  expect(
    afterCreateSchema.safeParse({
      orderId: '1',
      note: '',
      lines: [line, { ...line, orderLineId: '2', priceCents: 1 }],
    }).success,
  ).toBe(false)
  expect(
    afterProcessSchema.safeParse({
      version: 1,
      note: '',
      lines: [{ id: '1', qty: 2, priceCents: STORED_INT_MAX }],
    }).success,
  ).toBe(false)
})
