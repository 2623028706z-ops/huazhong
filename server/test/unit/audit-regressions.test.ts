import { copy, type Topic } from '@huazhong/shared'
import { expect, test } from 'vitest'
import {
  CHANGES_PAYLOAD_MAX_BYTES,
  changesPayloadSchema,
  encodeChanges,
} from '../../src/common/changes.ts'
import { logViewOf, priceChangesText } from '../../src/common/domain/log-view.ts'
import { exactNumber, sumOf, unitTotalsOf } from '../../src/common/domain/units.ts'

test('大账本分包保留每个主题和版本，每包均可解析且在 NOTIFY 字节限制内', () => {
  const changes = Array.from({ length: 800 }, (_, index) => ({
    topic: `receipt:${index + 1}` as const,
    version: index % 2 ? null : index,
  }))
  const scope = { storeIds: ['1', '2'], supplierIds: ['3'] }
  const texts = encodeChanges({ changes, scope })
  expect(texts.length).toBeGreaterThan(1)
  const packets = texts.map((text) => {
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CHANGES_PAYLOAD_MAX_BYTES)
    return changesPayloadSchema.parse(JSON.parse(text))
  })
  expect(packets.flatMap((packet) => packet.changes)).toEqual(changes)
  expect(packets.every((packet) => JSON.stringify(packet.scope) === JSON.stringify(scope))).toBe(
    true,
  )
})

test.each(['storeIds', 'supplierIds'] as const)(
  '大 %s 作用域含多字节字符时，各接收者都能收到全部主题',
  (key) => {
    const ids = Array.from({ length: 1000 }, (_, index) => `门店-${index}`)
    const changes = [{ topic: 'orders' as const, version: null }]
    const packets = encodeChanges({
      changes,
      scope: { storeIds: [], supplierIds: [], [key]: ids },
    }).map((text) => {
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CHANGES_PAYLOAD_MAX_BYTES)
      return changesPayloadSchema.parse(JSON.parse(text))
    })
    expect(packets.flatMap((packet) => packet.scope[key])).toEqual(ids)
    expect(
      packets.every((packet) => JSON.stringify(packet.changes) === JSON.stringify(changes)),
    ).toBe(true)
  },
)

test('小通知原样编码；不可拆分的异常主题明确报错，不截断消息', () => {
  const scope = { storeIds: [], supplierIds: [] }
  const payload = { changes: [{ topic: 'stock' as const, version: null }], scope }
  expect(encodeChanges(payload)).toEqual([JSON.stringify(payload)])
  expect(() =>
    encodeChanges({
      changes: [{ topic: `order:${'1'.repeat(9000)}` as Topic, version: null }],
      scope,
    }),
  ).toThrow('single change payload too large')
})

test('已有日志的字符串、数组、对象都投影为显示字符串，不把字符串拆成逐字字段', () => {
  expect(logViewOf(null)).toBeNull()
  expect(logViewOf(undefined)).toBeNull()
  expect(logViewOf('向日葵 1 枝')).toEqual({ [copy.log.changes]: '向日葵 1 枝' })
  expect(logViewOf([{ name: '向日葵', qty: 1 }])).toEqual({
    [copy.log.changes]: '[{"name":"向日葵","qty":1}]',
  })
  expect(logViewOf({ 金额: '¥1.00', 数量: 1, 启用: false, 明细: [1] })).toEqual({
    金额: '¥1.00',
    数量: '1',
    启用: 'false',
    明细: '[1]',
  })
  expect(priceChangesText([{ name: '向日葵', fromCents: 100, toCents: 200 }])).toBe(
    copy.order.change.price('向日葵', '¥1.00', '¥2.00'),
  )
})

test('宽类型汇总保留精确结果，超过 JS 安全整数不静默舍入', () => {
  expect(exactNumber('2147483648')).toBe(2147483648)
  expect(sumOf([2147483647, 1], (value) => value)).toBe(2147483648)
  expect(() => sumOf([Number.MAX_SAFE_INTEGER, 1], (value) => value)).toThrow()
  expect(() => sumOf([1.5], (value) => value)).toThrow()
  expect(
    unitTotalsOf([
      { unit: '枝', qty: 2147483647 },
      { unit: '枝', qty: 1 },
    ]),
  ).toEqual([{ unit: '枝', qty: 2147483648 }])
})
