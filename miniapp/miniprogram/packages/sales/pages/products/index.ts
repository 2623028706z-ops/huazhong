// X9 产品管理（06 章 X9）：按分类列产品（图、名、单位、配方花材数；停用的标「已停用」）。
// 底栏「管理分类」（manageCategories，次）、「新建产品」（create）。分类是产品内部分类（单品、花束…），
// 门店订货页的分类在订货目录里管（2026-10-03 确认）。管理分类弹层见 hz-category-sheet
import { contract, copy, type ProductCategory, type ProductItem } from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk } from '../../../../core/guard'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'

const FORM_URL = '/packages/sales/pages/product-form/index'

function groupsOf(categories: readonly ProductCategory[], products: readonly ProductItem[]) {
  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      rows: products
        .filter((product) => product.categoryId === category.id)
        .map((product) => ({
          id: product.id,
          name: product.name,
          meta: [product.unit, copy.screen.bomCount(product.bom.length)].join(copy.separator),
          imageUrl: product.imageUrl ?? '',
          disabled: !product.enabled,
        })),
    }))
    .filter((group) => group.rows.length > 0)
}

Page({
  data: {
    title: copy.screen.title.products,
    loaded: false,
    failure: null as FailureView | null,
    groups: [] as ReturnType<typeof groupsOf>,
    categories: [] as ProductCategory[],
    canCreate: false,
    canManage: false,
    sheet: false,
    sheetError: '',
    saving: false,
    texts: {
      manage: copy.screen.action.manageCategories,
      create: copy.screen.action.createProduct,
      categories: copy.screen.title.categories,
      disabled: copy.tag.disabled,
      empty: copy.screen.empty.products,
    },
  },
  idempotencyKey: '',
  onShow() {
    void this.load()
  },
  async load(): Promise<void> {
    const [categories, products] = await Promise.all([
      request(contract.listProductCategories),
      request(contract.listProducts, { query: {} }),
    ])
    if (!categories.ok || !products.ok) {
      const failure = firstFailure([categories, products])
      if (failure)
        this.setData({ failure: failureOf(failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.setData({
      loaded: true,
      failure: null,
      categories: categories.data.items,
      groups: groupsOf(categories.data.items, products.data.items),
      canCreate: hasAction(products.data.actions, 'create'),
      canManage: hasAction(products.data.actions, 'manageCategories'),
    })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${FORM_URL}?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: FORM_URL })
  },
  onManage() {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ sheet: true, sheetError: '' })
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  // 分类写操作的结果：成功刷新列表，失败写在弹层里
  async settle(result: Result<unknown>): Promise<boolean> {
    this.setData({ saving: false })
    if (result.ok) {
      await this.load()
      return true
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') await this.load()
    if (view) {
      const message = messageOf(view)
      this.setData({ sheetError: message })
    }
    return false
  },
  // 保存名称：id 为空是新增（带幂等键，成功后换一个新的）
  async onSaveName(event: DetailEvent<{ id: string; name: string }>): Promise<void> {
    const { id, name } = event.detail
    this.setData({ saving: true })
    const result = id
      ? await request(contract.updateProductCategory, { params: { id }, body: { name } })
      : await request(
          contract.createProductCategory,
          { body: { name } },
          { idempotencyKey: this.idempotencyKey },
        )
    if ((await this.settle(result)) && !id) this.idempotencyKey = newIdempotencyKey()
  },
  // 上移：和上一个交换后整组提交
  async onUp(event: DetailEvent<number>): Promise<void> {
    const index = event.detail
    const ids = this.data.categories.map((category) => category.id)
    const previous = ids[index - 1]
    const current = ids[index]
    if (previous === undefined || current === undefined) return
    ids[index - 1] = current
    ids[index] = previous
    await this.settle(await request(contract.orderProductCategories, { body: { ids } }))
  },
  async onDelete(event: DetailEvent<string>): Promise<void> {
    const confirmed = await confirmAsk(this, {
      title: copy.screen.confirm.deleteCategory,
      body: '',
      cancel: copy.confirm.cancel,
      confirm: copy.screen.action.delete,
    })
    if (!confirmed) return
    await this.settle(
      await request(contract.deleteProductCategory, { params: { id: event.detail } }),
    )
  },
  onFailureAction() {
    void this.load()
  },
})
