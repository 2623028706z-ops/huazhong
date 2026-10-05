// 体验改版第 2 批「录入方式」：添加明细弹层、代客下单选产品、再来一单、改单核对、出库分类默认上次
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  contract,
  type CatalogCategory,
  type CatalogItem,
  type Endpoint,
  type OrderDetail,
  type StoreCatalogItem,
} from '@huazhong/shared'

const mocks = vi.hoisted(() => ({
  request: vi.fn<(endpoint: Endpoint, input?: unknown, options?: unknown) => Promise<unknown>>(),
  storage: new Map<string, unknown>(),
  showToast: vi.fn(),
}))
vi.mock('../miniprogram/core/request', () => ({
  request: mocks.request,
  newIdempotencyKey: () => 'test-key',
  firstFailure: () => null,
}))
vi.mock('../miniprogram/core/live', () => ({
  unwatch: () => undefined,
  watch: () => undefined,
  watchNewer: () => undefined,
  pullToRefresh: {},
}))

beforeEach(() => {
  vi.resetModules()
  mocks.request.mockReset()
  mocks.storage.clear()
  vi.stubGlobal('wx', {
    enableAlertBeforeUnload: vi.fn(),
    disableAlertBeforeUnload: vi.fn(),
    showToast: mocks.showToast,
    redirectTo: vi.fn(),
    getStorageSync: (key: string) => mocks.storage.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => mocks.storage.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

const ok = (data: unknown) => ({ ok: true, data })

describe('添加明细弹层（02 章 hz-pick-sheet）', () => {
  const rows = [
    { id: 'a', name: '粉玫瑰花束', group: '花束', code: 'P01', unitCents: 6800 },
    { id: 'b', name: '白绿清新花束', group: '花束', code: 'P02', unitCents: 5000 },
    { id: 'c', name: '白绿桌花', group: '桌花', code: '', unitCents: 12000 },
  ]

  it('点「+」选上数量 1，步进器改数量，减到 0 取消；底部写已选种数和金额', async () => {
    const { pickChosen, pickOpen, pickSet } = await import('../miniprogram/views/pick')
    let state = pickOpen(rows)
    expect(state.picks.map((row) => row.head)).toEqual(['花束', '', '桌花'])
    expect(state.pickSummary).toBe('已选 0 种')
    state = pickSet(state, 'c', 1)
    state = pickSet(state, 'a', 1)
    state = pickSet(state, 'a', 3)
    expect(state.pickConfirm).toBe('添加（2）')
    expect(state.pickSummary).toBe('已选 2 种 · ¥324.00')
    expect(state.picks.find((row) => row.id === 'a')?.qty).toBe(3)
    expect(pickChosen(state)).toEqual([
      { id: 'c', qty: 1 },
      { id: 'a', qty: 3 },
    ])
    state = pickSet(state, 'c', 0)
    expect(pickChosen(state)).toEqual([{ id: 'a', qty: 3 }])
    expect(state.pickCount).toBe(1)
  })

  it('按名称、编码搜，分组标题跟着过滤后的行；已选的数量保留；不超过上限', async () => {
    const { pickOpen, pickSearch, pickSet } = await import('../miniprogram/views/pick')
    let state = pickSet(pickOpen(rows), 'a', 2)
    state = pickSearch(state, '白绿')
    expect(state.picks.map((row) => [row.id, row.head])).toEqual([
      ['b', '花束'],
      ['c', '桌花'],
    ])
    expect(pickSearch(state, 'P01').picks.map((row) => row.id)).toEqual(['a'])
    expect(pickSearch(state, '').picks.find((row) => row.id === 'a')?.qty).toBe(2)
    const limited = pickSet(pickOpen([{ id: 'x', name: '售后', max: 4 }]), 'x', 9)
    expect(limited.pickQty).toEqual({ x: 4 })
    expect(limited.pickSummary).toBe('已选 1 种')
  })

  it('花材行：出库、报损写库存，其余写单位；编码可搜', async () => {
    const { materialPickOf } = await import('../miniprogram/views/pick')
    const material = { id: 'm', name: '粉玫瑰', unit: '枝', code: 'M01', stockQty: 120 }
    expect(materialPickOf(material, true)).toMatchObject({ sub: '库存 120 枝', code: 'M01' })
    expect(materialPickOf(material).sub).toBe('单位 枝')
  })
})

describe('X4 代客下单选产品', () => {
  const item = (patch: Partial<CatalogItem>): CatalogItem => ({
    productId: 'p',
    version: 1,
    name: '产品',
    unit: '束',
    imageFileId: null,
    imageUrl: null,
    categoryId: 'k1',
    categoryName: '花束',
    customerCode: '',
    enabled: true,
    listPriceCents: 6800,
    bom: [],
    ...patch,
  })
  const categories: CatalogCategory[] = [
    { id: 'k1', name: '花束', sort: 2, itemCount: 2 },
    { id: 'k2', name: '桌花', sort: 1, itemCount: 1 },
  ]

  it('按订货分类顺序分组，小字写客户产品编码 · 订货价；停用的、已加的不列', async () => {
    const { addableOf, lineOfCatalog } =
      await import('../miniprogram/packages/sales/pages/order-form/form')
    const catalog = [
      item({ productId: 'a', name: '粉玫瑰日常花束', customerCode: 'CX-01' }),
      item({ productId: 'b', name: '停用花束', enabled: false }),
      item({ productId: 'c', name: '白绿桌花', categoryId: 'k2', categoryName: '桌花' }),
      item({ productId: 'd', name: '已加花束' }),
    ]
    const added = [lineOfCatalog(catalog[3] as CatalogItem, 2)]
    expect(added[0]?.qty).toBe(2)
    expect(addableOf(catalog, categories, added)).toEqual([
      expect.objectContaining({ id: 'c', group: '桌花', sub: '订货价 ¥68.00/束' }),
      expect.objectContaining({
        id: 'a',
        group: '花束',
        code: 'CX-01',
        sub: '客户产品编码 CX-01 · 订货价 ¥68.00/束',
        unitCents: 6800,
      }),
    ])
  })
})

describe('X4 客户门店一次选', () => {
  interface FormPage {
    data: Record<string, unknown> & {
      form: { customerId: string; storeId: string; lines: unknown[] }
    }
    setData(patch: Record<string, unknown>): void
    [key: string]: unknown
  }
  const store = (id: string, name: string, enabled = true) => ({ id, name, enabled })
  const customers = [
    {
      id: '1',
      name: '晨曦花艺',
      enabled: true,
      overdue: null,
      stores: [store('11', '滨江店'), store('12', '停用店', false)],
    },
    {
      id: '2',
      name: '云间花事',
      enabled: true,
      overdue: null,
      stores: [store('21', '西湖店'), store('22', '河坊店')],
    },
    { id: '3', name: '停用客户', enabled: false, overdue: null, stores: [store('31', '某店')] },
  ]

  it('启用客户的启用门店按客户分组；换客户清空明细并提示，同客户换门店明细照留', async () => {
    let captured: FormPage | undefined
    vi.stubGlobal('Page', (definition: FormPage) => {
      captured = {
        ...definition,
        data: structuredClone(definition.data),
        setData(patch) {
          Object.assign(this.data, patch)
        },
      }
    })
    await import('../miniprogram/packages/sales/pages/order-form/index')
    if (!captured) throw new Error('Page not registered')
    const page = captured
    const call = (method: string, ...args: unknown[]) =>
      Reflect.apply(page[method] as (...a: unknown[]) => unknown, page, args) as Promise<void>
    mocks.request.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint.path === contract.listCustomers.path
          ? ok({ items: customers, nextCursor: null })
          : ok({ items: [], categories: [] }),
      ),
    )
    await call('loadCustomers')
    const options = page.data.storeOptions as { id: string; group: string; shown: string }[]
    expect(options.map((row) => [row.id, row.group, row.shown])).toEqual([
      ['11', '晨曦花艺', '晨曦花艺 · 滨江店'],
      ['21', '云间花事', '云间花事 · 西湖店'],
      ['22', '云间花事', '云间花事 · 河坊店'],
    ])
    await call('onStore', { detail: '21' })
    expect(page.data.form).toMatchObject({ customerId: '2', storeId: '21' })
    page.data.form = {
      ...page.data.form,
      lines: [
        {
          productId: 'a',
          name: 'A',
          code: '',
          unit: '束',
          qty: 1,
          priceText: '68.00',
          discontinued: false,
        },
      ],
    }
    await call('onStore', { detail: '22' })
    expect(page.data.form).toMatchObject({
      customerId: '2',
      storeId: '22',
      lines: [{ productId: 'a' }],
    })
    await call('onStore', { detail: '11' })
    expect(page.data.form).toMatchObject({ customerId: '1', storeId: '11', lines: [] })
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '换了客户，已清空产品明细' }),
    )
  })
})

const orderOf = (patch: Partial<OrderDetail>) =>
  ({
    id: 'o1',
    no: 'SO-260929-018',
    version: 3,
    orderDate: '2026-09-29',
    note: '',
    lines: [
      { productId: 'a', name: '粉玫瑰日常花束', unit: '束', qty: 20, priceCents: 6800 },
      { productId: 'b', name: '白绿清新花束', unit: '束', qty: 10, priceCents: 5000 },
    ],
    ...patch,
  }) as OrderDetail

describe('S1 上一单、再来一单（07 章 E13）', () => {
  const catalog = [
    { productId: 'a', name: '粉玫瑰日常花束', unit: '束', listPriceCents: 7000 },
    { productId: 't', name: '白绿桌花', unit: '个', listPriceCents: 12000 },
  ] as StoreCatalogItem[]

  it('同款换成上一单数量，其余照留，单价按现在的订货价，停用的跳过', async () => {
    const { lastOrderViewOf, reorderLines } =
      await import('../miniprogram/packages/store/last-order')
    const cart = [
      { productId: 'a', qty: 2, name: '粉玫瑰日常花束', unit: '束', priceCents: 6800 },
      { productId: 't', qty: 1, name: '白绿桌花', unit: '个', priceCents: 12000 },
    ]
    const result = reorderLines(cart, orderOf({}), catalog)
    expect(result.skipped).toEqual(['白绿清新花束'])
    expect(result.lines).toEqual([
      { productId: 'a', qty: 20, name: '粉玫瑰日常花束', unit: '束', priceCents: 7000 },
      { productId: 't', qty: 1, name: '白绿桌花', unit: '个', priceCents: 12000 },
    ])
    expect(lastOrderViewOf(orderOf({}))).toEqual({
      title: '上一单 SO-260929-018',
      meta: '下单日期 2026-09-29 · 粉玫瑰日常花束 20束、白绿清新花束 10束',
    })
    expect(lastOrderViewOf(null)).toBeNull()
  })

  it('跳过取消、作废的单，取最近一张（含待确认）；从没下过单返回 null', async () => {
    const { loadLastOrder } = await import('../miniprogram/packages/store/last-order')
    mocks.request.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint.path === contract.listOrders.path
          ? ok({
              items: [
                { id: 'x', status: 'cancelled' },
                { id: 'y', status: 'voided' },
                { id: 'z', status: 'pending_confirm' },
              ],
              nextCursor: null,
            })
          : ok(orderOf({ id: 'z' })),
      ),
    )
    const last = await loadLastOrder()
    expect(last).toMatchObject({ ok: true, data: { id: 'z' } })
    expect(mocks.request.mock.calls[1]?.[1]).toEqual({ params: { id: 'z' } })
    mocks.request.mockReset()
    mocks.request.mockResolvedValue(
      ok({ items: [{ id: 'x', status: 'cancelled' }], nextCursor: null }),
    )
    expect(await loadLastOrder()).toEqual({ ok: true, data: null })
  })
})

describe('S1 改单核对修改（07 章 E03）', () => {
  it('结算条写比原单多 / 少多少，弹层列出改了的行', async () => {
    const { editReviewOf, startEdit } = await import('../miniprogram/packages/store/cart-source')
    startEdit(orderOf({}))
    const same = editReviewOf([
      { productId: 'a', qty: 20, name: '粉玫瑰日常花束', unit: '束', priceCents: 6800 },
      { productId: 'b', qty: 10, name: '白绿清新花束', unit: '束', priceCents: 5000 },
    ])
    expect(same).toEqual({ diffText: '', changes: [] })
    const more = editReviewOf([
      { productId: 'a', qty: 21, name: '粉玫瑰日常花束', unit: '束', priceCents: 6800 },
      { productId: 'b', qty: 10, name: '白绿清新花束', unit: '束', priceCents: 5000 },
    ])
    expect(more).toEqual({
      diffText: '比原单多 ¥68.00',
      changes: [{ key: 'a', name: '粉玫瑰日常花束', text: '20 → 21' }],
    })
    const less = editReviewOf([
      { productId: 'a', qty: 20, name: '粉玫瑰日常花束', unit: '束', priceCents: 6800 },
    ])
    expect(less.diffText).toBe('比原单少 ¥500.00')
    expect(less.changes).toEqual([{ key: 'b', name: '白绿清新花束', text: '10 → 0' }])
  })
})

describe('W5 出库分类默认上次用的', () => {
  interface TestPage {
    data: Record<string, unknown> & { form: { outCategoryId: string } }
    setData(patch: Record<string, unknown>): void
    [key: string]: unknown
  }
  async function loadDocForm(): Promise<TestPage> {
    let captured: TestPage | undefined
    vi.resetModules()
    vi.stubGlobal('Page', (definition: { data: TestPage['data'] }) => {
      captured = {
        ...definition,
        data: structuredClone(definition.data),
        setData(patch) {
          Object.assign(this.data, patch)
        },
      }
    })
    await import('../miniprogram/packages/warehouse/pages/doc-form/index')
    if (!captured) throw new Error('Page not registered')
    return captured
  }
  const call = (page: TestPage, method: string, ...args: unknown[]) =>
    Reflect.apply(page[method] as (...a: unknown[]) => unknown, page, args) as Promise<void>
  function reply(categories: { id: string; enabled: boolean }[]) {
    mocks.request.mockImplementation((endpoint) => {
      if (endpoint.path === contract.listInventory.path)
        return Promise.resolve(ok({ items: [], nextCursor: null }))
      if (endpoint.path === contract.listOutCategories.path)
        return Promise.resolve(
          ok({ items: categories.map((row) => ({ ...row, name: `分类${row.id}` })) }),
        )
      if (endpoint.path === contract.me.path) return Promise.resolve(ok({ id: 'u7' }))
      return Promise.resolve(ok({ id: 'doc1' }))
    })
  }

  it('按账号记在本机；分类停用了就不默认；提交成功记下这次的', async () => {
    mocks.storage.set('hz-out-category:u7', '12')
    reply([
      { id: '11', enabled: true },
      { id: '12', enabled: true },
    ])
    const page = await loadDocForm()
    await call(page, 'onLoad', { kind: 'out' })
    await call(page, 'load')
    expect(page.data.form.outCategoryId).toBe('12')
    expect(page.data.changed).toBe(false)

    reply([
      { id: '11', enabled: true },
      { id: '12', enabled: false },
    ])
    const again = await loadDocForm()
    await call(again, 'onLoad', { kind: 'out' })
    await call(again, 'load')
    expect(again.data.form.outCategoryId).toBe('')
    await call(again, 'onCategory', { currentTarget: { dataset: { key: '11' } } })
    again.data.form = {
      ...again.data.form,
      lines: [
        {
          materialId: '1',
          name: '粉玫瑰',
          code: '',
          unit: '枝',
          qty: 1,
          priceText: '',
          stockQty: 5,
        },
      ],
    } as never
    await call(again, 'onSubmit')
    expect(mocks.storage.get('hz-out-category:u7')).toBe('11')
  })
})
