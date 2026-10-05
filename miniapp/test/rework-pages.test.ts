import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contract, copy, type Endpoint } from '@huazhong/shared'

const mocks = vi.hoisted(() => ({
  request: vi.fn<(endpoint: Endpoint, input?: unknown, options?: unknown) => Promise<unknown>>(),
  changes: [] as ((version: number | null) => void)[],
  navigateTo: vi.fn(),
  disableUnload: vi.fn(),
}))
vi.mock('../miniprogram/core/request', () => ({
  request: mocks.request,
  newIdempotencyKey: () => 'test-key',
  firstFailure: () => null,
}))
vi.mock('../miniprogram/core/live', () => ({
  unwatch: () => undefined,
  unwatchOnLeave: {},
  pullToRefresh: {},
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
  mocks.navigateTo.mockClear()
  mocks.disableUnload.mockClear()
  vi.stubGlobal('wx', {
    enableAlertBeforeUnload: vi.fn(),
    disableAlertBeforeUnload: mocks.disableUnload,
    showToast: vi.fn(),
    navigateBack: vi.fn(),
    navigateTo: mocks.navigateTo,
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

describe('对账单变化不覆盖资金草稿', () => {
  it('实时只提示，显式核对后保留金额优惠备注并换所选版本', async () => {
    const page = await loadPage(() => import('../miniprogram/packages/finance/pages/receive/index'))
    const statement = {
      id: '1',
      no: 'DZ-1',
      version: 1,
      kind: 'supplier',
      partyId: '9',
      partyName: '供应商',
      periodFrom: '2026-10-01',
      periodTo: '2026-10-02',
      statementDate: '2026-10-02',
      dueDate: null,
      settledAt: null,
      amountCents: 1000,
      dueCents: 1000,
      sourceCount: 1,
      status: 'unsettled',
      overdueDays: 0,
      actions: [],
      lockedReason: null,
    }
    const draft = {
      receiptDate: '2026-10-01',
      amountText: '20',
      discountText: '1',
      discountReason: '抹零',
      methodName: '微信',
      note: '保留备注',
      statements: [statement],
    }
    page.setData({ isPayment: true, partyId: '9', form: draft })
    await invoke(page, 'watchParty')
    mocks.changes[0]?.(null)
    expect(page.data.form).toEqual(draft)
    expect(page.data.needsReview).toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        partyId: '9',
        creditCents: 200,
        items: [{ ...statement, version: 2, dueCents: 700 }],
        actions: [],
      },
    })
    await invoke(page, 'onReview')
    expect(page.data.form).toMatchObject({
      ...draft,
      statements: [{ id: '1', version: 2, dueCents: 700 }],
    })
    expect(page.data.changes).toEqual(['DZ-1 · 来源单据有变化，请核对后再生成'])
    expect(page.data.needsReview).toBe(false)
  })
})

describe('阶段5草稿与复合单据引用', () => {
  it('收付款所选对账单进入完整详情页', async () => {
    const page = await loadPage(() => import('../miniprogram/packages/finance/pages/receive/index'))
    await invoke(page, 'onOpenStatement', { currentTarget: { dataset: { key: '1' } } })
    expect(mocks.navigateTo).toHaveBeenCalledWith({
      url: '/packages/finance/pages/statement-detail/index?id=1',
    })
  })
  it('入库详情推送保持草稿和原版本，提交仍受版本锁校验；核销后关闭不可用操作', async () => {
    const page = await loadPage(
      () => import('../miniprogram/packages/warehouse/pages/doc-detail/index'),
    )
    const form = {
      reason: '改价草稿',
      lines: [{ lineId: '1', name: '玫瑰', unit: '枝', qty: 10, priceText: '3.00' }],
    }
    page.document = { version: 1 }
    page.id = '1'
    page.setData({ loaded: true, sheet: 'reprice', changed: true, form })
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: { version: 2, actions: [{ code: 'reprice', enabled: true }] },
    })
    await invoke(page, 'load')
    expect(page.document).toEqual({ version: 1 })
    expect(page.data.form).toEqual(form)
    expect(page.data.realtime).toBe(copy.screen.realtime.editing)
    mocks.request.mockResolvedValueOnce({ ok: false, failure: { kind: 'network' } })
    await invoke(page, 'onSave')
    expect(mocks.request.mock.calls.at(-1)?.[1]).toMatchObject({ body: { version: 1 } })
    expect(await invoke(page, 'preserve', { actions: [{ code: 'reprice', enabled: false }] })).toBe(
      false,
    )
    expect(page.data.sheet).toBe('')
    expect(page.data.changed).toBe(false)
  })
  it('管理出库分类跳到出库分类页，不再在分类弹层里套管理弹层，草稿保留', async () => {
    const page = await loadPage(
      () => import('../miniprogram/packages/warehouse/pages/doc-form/index'),
    )
    const form = {
      supplierId: '',
      outCategoryId: '1',
      reason: '保留',
      lines: [],
      images: [],
    }
    page.setData({ kind: 'out', form, changed: true, categoryPick: true })
    await invoke(page, 'onManageCategories')
    expect(mocks.navigateTo).toHaveBeenCalledWith({
      url: '/packages/warehouse/pages/out-categories/index',
    })
    expect(page.data.categoryPick).toBe(false)
    expect(page.data.categorySheet).toBeUndefined()
    expect(page.data.form).toEqual(form)
    expect(page.data.changed).toBe(true)
  })
})

describe('X14 从其他客户复制', () => {
  const sourceOf = (token: string) => ({
    ok: true,
    data: {
      sources: [{ customerId: '2', customerName: '乙客户' }],
      fromCustomerId: '2',
      items: [
        {
          productId: 'a',
          name: '粉玫瑰花束',
          unit: '束',
          categoryName: '花束',
          listPriceCents: 6800,
          bom: [
            { materialId: 'm', materialName: '粉玫瑰', unit: '枝', qty: 10, materialEnabled: true },
          ],
          skipReason: null,
        },
        {
          productId: 'b',
          name: '白百合',
          unit: '束',
          categoryName: '花束',
          listPriceCents: 5000,
          bom: [],
          skipReason: 'duplicate',
        },
      ],
      previewToken: token,
    },
  })
  it('重名的不能勾；STALE 重新拉来源并保留还能勾的，不自动重试复制', async () => {
    const page = await loadPage(
      () => import('../miniprogram/packages/sales/pages/catalog-copy/index'),
    )
    mocks.request.mockResolvedValueOnce(sourceOf('old'))
    await invoke(page, 'onLoad', { customerId: '1' })
    await Promise.resolve()
    await invoke(page, 'onPick', { currentTarget: { dataset: { key: 'b' } } })
    await invoke(page, 'onPick', { currentTarget: { dataset: { key: 'a' } } })
    expect(page.data.picked).toEqual(['a'])
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
      .mockResolvedValueOnce(sourceOf('fresh'))
    await invoke(page, 'onCopy')
    expect(mocks.request.mock.calls.map(([endpoint]) => endpoint.path)).toEqual([
      contract.catalogCopySources.path,
      contract.copyCatalog.path,
      contract.catalogCopySources.path,
    ])
    expect(mocks.request.mock.calls[1]?.[1]).toMatchObject({
      body: { fromCustomerId: '2', productIds: ['a'], previewToken: 'old' },
    })
    expect(page.data.picked).toEqual(['a'])
    expect(page.data.error).toBe(copy.screen.catalog.copyChanged)
  })
})

describe('C2 需求卡片与草稿来源', () => {
  it('每张卡片显示实际shipFrom/shipTo，并携带需求快照；缺货只在前端按缺口筛', async () => {
    mocks.request.mockResolvedValueOnce({
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
          {
            materialId: '2',
            name: '够用的花材',
            unit: '枝',
            enabled: true,
            shipFrom: '2026-10-03',
            shipTo: '2026-10-03',
            needQty: 5,
            stockQty: 10,
            inTransitQty: 0,
            leftQty: 5,
            invited: false,
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
    // 只看缺货：不缺的花材不列（2026-10-05 体验改版第 1 批，没有「全部 / 缺货 / 待填报」标签）
    expect(rows).toHaveLength(1)
    expect(rows[0]?.range).toBe('2026-10-03 ~ 2026-10-04')
    expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ query: { shortageOnly: 'false' } })
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

describe('X8 门店段一行一家', () => {
  it('只给门店名、已停用和点选状态，不再带联系人、电话', async () => {
    const { storeRowsOf } = await import('../miniprogram/packages/sales/pages/customers/form')
    const customer = {
      stores: [
        { id: '1', name: '滨江店', enabled: true, contact: '陈女士', phone: '13800000000' },
        { id: '2', name: '老店', enabled: false, contact: '', phone: '' },
      ],
    } as unknown as Parameters<typeof storeRowsOf>[0]
    expect(storeRowsOf(customer, '1')).toEqual([
      { id: '1', name: '滨江店', disabled: false, picked: true },
      { id: '2', name: '老店', disabled: true, picked: false },
    ])
  })
})
