// X9 产品管理（06 章 X9）：按分类列产品（图、名、单位、配方花材数；停用的标「已停用」）。
// 底栏「管理分类」（manageCategories，次）、「新建产品」（create）。管理分类弹层：改名、上移、删除、新增
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
    renaming: null as ProductCategory | null,
    nameText: '',
    newName: '',
    sheetError: '',
    saving: false,
    texts: {
      manage: copy.screen.action.manageCategories,
      create: copy.screen.action.createProduct,
      categories: copy.screen.title.categories,
      name: copy.screen.label.name,
      add: copy.screen.action.addCategory,
      up: copy.screen.action.moveUp,
      save: copy.action.save,
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
    this.setData({ sheet: true, renaming: null, newName: '', sheetError: '' })
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  onBackSheet() {
    this.setData({ renaming: null, sheetError: '' })
  },
  onRename(event: KeyEvent) {
    const category = this.data.categories.find((c) => c.id === event.currentTarget.dataset.key)
    if (category) this.setData({ renaming: category, nameText: category.name, sheetError: '' })
  },
  onNameText(event: DetailEvent<string>) {
    this.setData({ nameText: event.detail, sheetError: '' })
  },
  onNewName(event: DetailEvent<string>) {
    this.setData({ newName: event.detail, sheetError: '' })
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
  async onSaveName(): Promise<void> {
    const category = this.data.renaming
    if (!category) return
    this.setData({ saving: true })
    const input = { params: { id: category.id }, body: { name: this.data.nameText } }
    if (await this.settle(await request(contract.updateProductCategory, input)))
      this.setData({ renaming: null })
  },
  async onAdd(): Promise<void> {
    this.setData({ saving: true })
    const options = { idempotencyKey: this.idempotencyKey }
    const result = await request(
      contract.createProductCategory,
      { body: { name: this.data.newName } },
      options,
    )
    if (await this.settle(result)) {
      this.idempotencyKey = newIdempotencyKey()
      this.setData({ newName: '' })
    }
  },
  // 上移：和上一个交换后整组提交
  async onUp(event: DetailEvent<unknown, { index: number }>): Promise<void> {
    const { index } = event.currentTarget.dataset
    const ids = this.data.categories.map((category) => category.id)
    const previous = ids[index - 1]
    const current = ids[index]
    if (previous === undefined || current === undefined) return
    ids[index - 1] = current
    ids[index] = previous
    await this.settle(await request(contract.orderProductCategories, { body: { ids } }))
  },
  async onDelete(event: KeyEvent): Promise<void> {
    const confirmed = await confirmAsk(this, {
      title: copy.screen.confirm.deleteCategory,
      body: '',
      cancel: copy.confirm.cancel,
      confirm: copy.screen.action.delete,
    })
    if (!confirmed) return
    const params = { id: event.currentTarget.dataset.key }
    await this.settle(await request(contract.deleteProductCategory, { params }))
  },
  onFailureAction() {
    void this.load()
  },
})
