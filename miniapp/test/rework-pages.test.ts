import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contract, copy, type Endpoint } from '@huazhong/shared'

const mocks = vi.hoisted(() => ({
  request: vi.fn<(endpoint: Endpoint, input?: unknown, options?: unknown) => Promise<unknown>>(),
  changes: [] as ((version: number | null) => void)[],
}))
vi.mock('../miniprogram/core/request', () => ({
  request: mocks.request,
  newIdempotencyKey: () => 'test-key',
  firstFailure: () => null,
}))
vi.mock('../miniprogram/core/live', () => ({
  unwatch: () => undefined,
  unwatchOnLeave: {},
  watch: (_page: unknown, _topics: unknown, listener: (version: number | null) => void) => {
    mocks.changes.push(listener)
  },
  watchNewer: (_page: unknown, _topic: unknown, _current: unknown, listener: () => void) => {
    mocks.changes.push(listener)
  },
}))

interface TestPage {
  data: Record<string, unknown>
  setData(patch: Record<string, unknown>): void
  [key: string]: unknown
}
async function loadPage(importPage: () => Promise<unknown>): Promise<TestPage> {
  let captured: TestPage | undefined
  vi.stubGlobal(
    'Page',
    (definition: Record<string, unknown> & { data: Record<string, unknown> }) => {
      captured = {
        ...definition,
        data: structuredClone(definition.data),
        setData(patch) {
          Object.assign(this.data, patch)
        },
      }
    },
  )
  await importPage()
  if (!captured) throw new Error('Page not registered')
  return captured
}
async function invoke(page: TestPage, method: string, ...args: unknown[]) {
  const callback = page[method]
  if (typeof callback !== 'function') throw new Error(`Missing ${method}`)
  return (await Reflect.apply(callback, page, args)) as unknown
}

beforeEach(() => {
  vi.resetModules()
  mocks.request.mockReset()
  mocks.changes.length = 0
  vi.stubGlobal('wx', {
    enableAlertBeforeUnload: vi.fn(),
    disableAlertBeforeUnload: vi.fn(),
    showToast: vi.fn(),
    navigateBack: vi.fn(),
    navigateTo: vi.fn(),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('G30-F 历史日志筛选', () => {
  it('模块取logs.filterModules，调岗后仍有原模块，不请求me权限', async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], nextCursor: null, filterModules: ['sales', 'warehouse'] },
    })
    const page = await loadPage(() => import('../miniprogram/pages/logs/index'))
    await invoke(page, 'onLoad')
    await invoke(page, 'refresh')
    expect(page.data.dimensions).toMatchObject([
      { options: [{ id: 'sales' }, { id: 'warehouse' }] },
    ])
    expect(
      mocks.request.mock.calls.every(([endpoint]) => endpoint.path === contract.listLogs.path),
    ).toBe(true)
    await invoke(page, 'setModules', ['warehouse'])
    expect(page.data.dimensions).toEqual([])
  })
})

describe('H06/H12-F 账本变化不覆盖草稿', () => {
  it('version:null只提示，重核保留资金输入、清空失效核销并换令牌', async () => {
    const page = await loadPage(() => import('../miniprogram/packages/finance/pages/receive/index'))
    const draft = {
      receiptDate: '2026-10-01',
      amountText: '20',
      methodName: '微信',
      note: '备注',
      allocs: [{ orderId: '1', orderNo: 'PO-001', version: 1, unpaidCents: 1000, text: '10.00' }],
    }
    page.setData({ isPayment: true, customerId: '9', form: draft, ledgerToken: 'old-token' })
    await invoke(page, 'watchCustomer')
    mocks.changes[0]?.(null)
    expect(page.data.form).toEqual(draft)
    expect(page.data.ledgerToken).toBe('old-token')
    expect(page.data.needsReview).toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        ledgerToken: 'new-token',
        prepaidCents: 200,
        items: [
          { id: '1', no: 'PO-001', version: 2, unpaidCents: 700, notice: '单价改过，请核对' },
        ],
      },
    })
    await invoke(page, 'onReviewLedger')
    expect(page.data.form).toMatchObject({
      receiptDate: draft.receiptDate,
      amountText: '20',
      methodName: '微信',
      note: '备注',
      allocs: [{ orderId: '1', text: '', unpaidCents: 700, version: 2 }],
    })
    expect(page.data.ledgerToken).toBe('new-token')
    expect(page.data.ledgerChanges).toEqual([
      `PO-001${copy.separator}${copy.rework.ledgerDifference(1000, 700)}`,
    ])
    expect(page.data.needsReview).toBe(false)
  })
})

describe('X11 目录复制凭据', () => {
  it('零可复制不写，STALE只重预览，不自动重试复制', async () => {
    const page = await loadPage(() => import('../miniprogram/packages/sales/pages/directory/index'))
    page.setData({
      customerId: '1',
      copySourceId: '2',
      canCopy: true,
      copyPreview: { previewToken: 'zero', copyCount: 0, skipCount: 3 },
    })
    await invoke(page, 'onCopyCatalog')
    expect(mocks.request).not.toHaveBeenCalled()
    page.setData({ copyPreview: { previewToken: 'old', copyCount: 2, skipCount: 1 } })
    mocks.request
      .mockResolvedValueOnce({
        ok: false,
        failure: {
          kind: 'server',
          code: 'STALE',
          message: '目录已变化',
          requestId: null,
          latest: {},
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { previewToken: 'fresh', copyCount: 3, skipCount: 2 },
      })
    await invoke(page, 'onCopyCatalog')
    expect(mocks.request.mock.calls.map(([endpoint]) => endpoint.path)).toEqual([
      contract.copyCatalog.path,
      contract.previewCatalogCopy.path,
    ])
    expect(page.data.copyPreview).toEqual({ previewToken: 'fresh', copyCount: 3, skipCount: 2 })
    expect(page.data.copyError).toBe(copy.rework.catalogChanged)
  })
})

describe('C2 需求卡片与草稿来源', () => {
  it('每张卡片显示实际shipFrom/shipTo，并携带需求快照；缺货开关作为查询传入', async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        from: '2026-10-01',
        to: '2026-10-08',
        orderCount: 1,
        overdue: { count: 1, shipFrom: '2026-09-30', shipTo: '2026-09-30' },
        actions: [],
        mats: [
          {
            materialId: '1',
            name: '花材',
            unit: '枝',
            enabled: true,
            shipFrom: '2026-10-03',
            shipTo: '2026-10-04',
            needQty: 20,
            stockQty: 5,
            inTransitQty: 3,
            leftQty: -12,
            invited: true,
          },
        ],
      },
    })
    const page = await loadPage(() => import('../miniprogram/packages/purchase/pages/demand/index'))
    page.setData({
      from: '2026-10-01',
      to: '2026-10-08',
      shortageOnly: true,
      selected: ['1'],
      supplierId: '2',
    })
    await invoke(page, 'load')
    const rows = page.data.rows as { range: string }[]
    expect(rows[0]?.range).toBe('10-03 ~ 10-04 出货')
    expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ query: { shortageOnly: 'true' } })
    expect(await invoke(page, 'draft')).toMatchObject({
      demandContext: {
        from: '2026-10-01',
        to: '2026-10-08',
        expected: [{ materialId: '1', needQty: 20, stockQty: 5, inTransitQty: 3 }],
      },
      lines: [{ qty: 12 }],
    })
    expect(page.data.overdue).toMatchObject({ count: 1 })
  })
})
