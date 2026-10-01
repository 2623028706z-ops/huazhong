// 图片上传：申请签名 → 直传（MemoryFileStorage.put 模拟）→ complete → 表单带 fileId（05 章第 11 节）
import type { AfterDetail, OrderDetail } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { FileStorage, MemoryFileStorage } from '../src/common/storage.ts'
import { dataOf, idBy, startSales, type Api, type SalesApp } from './support/sales.ts'

let s: SalesApp
let storage: MemoryFileStorage
beforeEach(async () => {
  s = await startSales()
  const provided = s.t.app.get(FileStorage)
  if (!(provided instanceof MemoryFileStorage)) throw new Error('expected MemoryFileStorage')
  storage = provided
})
afterEach(async () => {
  await s.close()
})

interface Ticket {
  fileId: string
  uploadUrl: string
  formData: Record<string, string>
}

const ticketOf = async (api: Api, purpose: string) =>
  dataOf<Ticket>(
    await api.post('/files/upload-ticket', { purpose, mime: 'image/jpeg', sizeBytes: 1000 }),
  )

// 小程序按 formData 直传：对象键在 formData.key
const upload = (ticket: Ticket) => {
  storage.put(ticket.formData['key'] ?? '')
}

async function applyWith(imageFileIds: string[]) {
  const o021 = await idBy(s.t, 'orders.no', 'SO-260927-021')
  const store = await s.as('s1')
  const order = dataOf<OrderDetail>(await store.get(`/orders/${o021}`))
  return store.post('/store/afters', {
    orderId: o021,
    lines: [
      {
        orderLineId: order.lines[0]?.id,
        qty: 1,
        reason: 'damaged',
        description: '花头折损',
        imageFileIds,
      },
    ],
  })
}

describe('申请签名和确认上传', () => {
  test('签名返回 uploadUrl + formData；没传就 complete 报「图片没有上传成功」；传了后 ok 带地址', async () => {
    const store = await s.as('s1')
    const ticket = await ticketOf(store, 'after_image')
    expect(ticket.uploadUrl).toMatch(/^https:\/\//)
    expect(ticket.formData['key']).toMatch(/^after_image\//)
    const early = await store.post(`/files/${ticket.fileId}/complete`)
    expect(early.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '图片没有上传成功，请重试',
    })
    upload(ticket)
    const done = dataOf<{ status: string; url: string; thumbUrl: string }>(
      await store.post(`/files/${ticket.fileId}/complete`),
    )
    expect(done.status).toBe('ok')
    expect(done.url).toContain(ticket.formData['key'])
  })

  test('格式、大小不对 422；门店不能传产品图；别人不能 complete', async () => {
    const store = await s.as('s1')
    const bad = await store.post('/files/upload-ticket', {
      purpose: 'after_image',
      mime: 'image/gif',
      sizeBytes: 1000,
    })
    expect(bad.body.error?.fields).toEqual({ mime: '只能上传 jpg、png、webp 图片' })
    const big = await store.post('/files/upload-ticket', {
      purpose: 'after_image',
      mime: 'image/jpeg',
      sizeBytes: 100 * 1024 * 1024,
    })
    expect(big.body.error?.fields).toEqual({ sizeBytes: '图片太大了，请换一张' })
    const product = await store.post('/files/upload-ticket', {
      purpose: 'product_image',
      mime: 'image/jpeg',
      sizeBytes: 1000,
    })
    expect(product.status).toBe(403)
    const ticket = await ticketOf(store, 'after_image')
    upload(ticket)
    expect((await (await s.as('u2')).post(`/files/${ticket.fileId}/complete`)).status).toBe(404)
  })
})

describe('表单里带图片', () => {
  test('售后申请：没 complete 的图片拦住；ok 的保存后详情带签名地址', async () => {
    const store = await s.as('s1')
    const pending = await ticketOf(store, 'after_image')
    upload(pending)
    const blocked = await applyWith([pending.fileId])
    expect(blocked.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '图片没有上传成功，请重试',
    })
    dataOf(await store.post(`/files/${pending.fileId}/complete`))
    const saved = dataOf<AfterDetail>(await applyWith([pending.fileId]))
    expect(saved.lines[0]?.images).toHaveLength(1)
    expect(JSON.stringify(saved.lines[0]?.images)).toContain(pending.formData['key'])
  })

  test('别人上传的售后图片不能用；产品图不能当售后图', async () => {
    const sales = await s.as('u2')
    const others = await ticketOf(sales, 'after_image')
    upload(others)
    dataOf(await sales.post(`/files/${others.fileId}/complete`))
    expect((await applyWith([others.fileId])).body.error?.message).toBe('图片没有上传成功，请重试')
    const product = await ticketOf(sales, 'product_image')
    upload(product)
    dataOf(await sales.post(`/files/${product.fileId}/complete`))
    expect((await applyWith([product.fileId])).body.error?.message).toBe('图片没有上传成功，请重试')
  })
})
