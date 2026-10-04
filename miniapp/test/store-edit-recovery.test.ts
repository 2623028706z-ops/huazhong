import { contract, copy, type Endpoint, type OrderDetail } from '@huazhong/shared'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn<(endpoint: Endpoint, input?: unknown) => Promise<unknown>>(),
}))
vi.mock('../miniprogram/core/request', () => ({
  request: mocks.request,
  newIdempotencyKey: () => 'test-key',
}))

interface TestPage {
  data: Record<string, unknown>
  setData(patch: Record<string, unknown>): void
  [key: string]: unknown
}

let latest: OrderDetail
let catalogEnabled: boolean
let customerEnabled: boolean

function responseOf(endpoint: Endpoint) {
  if (endpoint.path === contract.me.path) return { ok: true, data: { id: '9', orgLabel: '门店' } }
  if (endpoint.path === contract.storeCatalog.path)
    return {
      ok: true,
      data: {
        customerId: '1',
        customerName: '客户',
        storeId: '1',
        storeName: '门店',
        lockedReason: customerEnabled ? null : copy.store.customerDisabledEdit,
        items: catalogEnabled
          ? [{ productId: '1', name: '花束', unit: '束', listPriceCents: 200 }]
          : [],
      },
    }
  if (endpoint.path === contract.getOrder.path) return { ok: true, data: latest }
  return { ok: false, failure: { kind: 'server', code: 'STALE', message: '订单已更新', latest } }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('wx', {
    enableAlertBeforeUnload: vi.fn(),
    disableAlertBeforeUnload: vi.fn(),
    showToast: vi.fn(),
    reLaunch: vi.fn(),
  })
  catalogEnabled = true
  customerEnabled = true
  latest = {
    id: '1',
    version: 2,
    orderDate: '2026-10-03',
    note: '',
    lockedReason: null,
    actions: [{ code: 'storeEdit', enabled: true, disabledReason: null, reasonRequired: null }],
    lines: [
      {
        id: '1',
        productId: '1',
        qty: 1,
        name: '花束',
        unit: '束',
        priceCents: 200,
        discontinued: false,
      },
    ],
  } as OrderDetail
  mocks.request.mockReset()
  mocks.request.mockImplementation((endpoint) => Promise.resolve(responseOf(endpoint)))
})
afterEach(() => vi.unstubAllGlobals())

async function invoke(page: TestPage, method: string, ...args: unknown[]) {
  const callback = page[method]
  if (typeof callback !== 'function') throw new Error(`Missing ${method}`)
  await Reflect.apply(callback, page, args)
}

async function editingPage() {
  let captured: TestPage | undefined
  vi.stubGlobal('Page', (definition: TestPage) => {
    captured = {
      ...definition,
      data: structuredClone(definition.data),
      setData(patch) {
        Object.assign(this.data, patch)
      },
    }
  })
  const cart = await import('../miniprogram/packages/store/cart-source')
  cart.startEdit({ ...latest, version: 1 })
  await import('../miniprogram/packages/store/pages/checkout/index')
  if (!captured) throw new Error('Page not registered')
  await invoke(captured, 'onLoad', { mode: 'edit' })
  await invoke(captured, 'load')
  const draft = cart.editDraft()
  if (draft?.lines[0]) draft.lines[0] = { ...draft.lines[0], qty: 3 }
  await invoke(captured, 'load')
  await invoke(captured, 'onNote', { detail: '保留备注' })
  await invoke(captured, 'onSubmit')
  expect(captured.data.needsReview).toBe(true)
  return { page: captured, cart }
}

function updates() {
  return mocks.request.mock.calls.filter(
    ([endpoint]) => endpoint.path === contract.updateStoreOrder.path,
  )
}

test('STALE 保留草稿；重载不偷换版本；显式重核更新价格和版本但不提交；再次确认才写入', async () => {
  const { page, cart } = await editingPage()
  await invoke(page, 'load')
  expect(cart.editDraft()?.version).toBe(1)
  await invoke(page, 'onSubmit')
  expect(updates()).toHaveLength(1)
  expect(page.data.needsReview).toBe(false)
  expect(page.data.note).toBe('保留备注')
  expect(page.data.rows).toMatchObject([{ qty: 3, priceCents: 200 }])
  expect(cart.editDraft()?.version).toBe(2)
  await invoke(page, 'onSubmit')
  expect(updates()).toHaveLength(2)
  expect(updates()[1]?.[1]).toMatchObject({
    body: { version: 2, note: '保留备注', lines: [{ productId: '1', qty: 3 }] },
  })
  expect(page.data.needsReview).toBe(true)
})

test('销售已确认或取消时不升级草稿版本，不再发送改单', async () => {
  const { page, cart } = await editingPage()
  latest = { ...latest, actions: [], lockedReason: '订单已确认' }
  await invoke(page, 'onSubmit')
  expect(page.data.formError).toBe('订单已确认')
  expect(page.data.needsReview).toBe(true)
  expect(cart.editDraft()?.version).toBe(1)
  expect(updates()).toHaveLength(1)
})

test('重核发现客户停用时保留原版本和数量、备注', async () => {
  const { page, cart } = await editingPage()
  customerEnabled = false
  await invoke(page, 'onSubmit')
  expect(page.data.formError).toBe(copy.store.customerDisabledEdit)
  expect(page.data.note).toBe('保留备注')
  expect(cart.editDraft()?.version).toBe(1)
  expect(updates()).toHaveLength(1)
})

test('重核发现产品停用时保留行并标停用，不悄悄移除数量', async () => {
  const { page } = await editingPage()
  catalogEnabled = false
  await invoke(page, 'onSubmit')
  expect(page.data.rows).toMatchObject([
    { qty: 3, tags: [{ text: copy.screen.tag.discontinued, warn: true }] },
  ])
  expect(updates()).toHaveLength(1)
})

test('重核断网不换版本，保留重新核对入口', async () => {
  const { page, cart } = await editingPage()
  mocks.request.mockResolvedValueOnce({ ok: false, failure: { kind: 'network' } })
  await invoke(page, 'onSubmit')
  expect(cart.editDraft()?.version).toBe(1)
  expect(page.data.needsReview).toBe(true)
  expect(page.data.saving).toBe(false)
  expect(updates()).toHaveLength(1)
})
